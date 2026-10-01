import { useEffect, useMemo, useState } from "react";
import type { Assignment, Lesson } from "./data/types";
import { supabase } from "./data/repository";

type Review = {
  id?: string;
  source_id: string;
  title: string;
  kind: string;
  due_at: string;
  interval_days: number;
  repetitions: number;
  last_quality?: string | null;
  skill: string;
};
const KEY = "group13.learning-loop.v2";
const DAY = 86_400_000;
function readLocal(): Review[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Review[];
  } catch {
    return [];
  }
}
function saveLocal(rows: Review[]) {
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export default function LearningLoop({
  assignments,
  lessons,
  userId,
  onOpenArena,
}: {
  assignments: Assignment[];
  lessons: Lesson[];
  userId: string | null;
  onOpenArena: () => void;
}) {
  const seeds = useMemo(
    () => [
      ...assignments.map((a) => ({
        source_id: `assignment:${a.id}`,
        title: a.title,
        kind: "Assignment",
        skill: a.unit,
      })),
      ...lessons.slice(0, 12).map((l) => ({
        source_id: `lesson:${l.id}`,
        title: l.topic,
        kind: "Lesson",
        skill: l.unit,
      })),
    ],
    [assignments, lessons],
  );
  const [rows, setRows] = useState<Review[]>(() => readLocal());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!supabase || !userId) {
        if (alive) setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("learning_reviews")
        .select(
          "id,source_id,title,kind,skill,due_at,interval_days,repetitions,last_quality",
        )
        .eq("user_id", userId)
        .order("due_at")
        .limit(100);
      if (alive) {
        setRows((data as Review[] | null) ?? []);
        setLoaded(true);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [userId]);
  useEffect(() => {
    if (!loaded) return;
    const current = new Map(rows.map((r) => [r.source_id, r]));
    const next = seeds.map(
      (seed) =>
        current.get(seed.source_id) ?? {
          ...seed,
          due_at: new Date().toISOString(),
          interval_days: 0,
          repetitions: 0,
        },
    );
    if (!next.length) return;
    setRows(next);
    saveLocal(next);
    if (supabase && userId)
      void supabase.from("learning_reviews").upsert(
        next.map((r) => ({
          user_id: userId,
          source_id: r.source_id,
          title: r.title,
          kind: r.kind,
          skill: r.skill,
          due_at: r.due_at,
          interval_days: r.interval_days,
          repetitions: r.repetitions,
          last_quality: r.last_quality ?? null,
        })),
        { onConflict: "user_id,source_id" },
      );
  }, [loaded, seeds]);
  const due = rows.filter((r) => new Date(r.due_at).getTime() <= Date.now());
  const mastered = rows.filter((r) => r.interval_days >= 14).length;
  const review = due[0];
  const mark = async (quality: "again" | "good" | "mastered") => {
    if (!review) return;
    const interval =
      quality === "again"
        ? 1
        : quality === "good"
          ? Math.max(1, review.interval_days * 2 || 2)
          : 30;
    const changed = {
      ...review,
      due_at: new Date(Date.now() + interval * DAY).toISOString(),
      interval_days: quality === "again" ? 0 : interval,
      repetitions: review.repetitions + 1,
      last_quality: quality,
    };
    const next = rows.map((r) =>
      r.source_id === review.source_id ? changed : r,
    );
    setRows(next);
    saveLocal(next);
    if (supabase && userId) {
      await supabase
        .from("learning_reviews")
        .upsert(
          { user_id: userId, ...changed },
          { onConflict: "user_id,source_id" },
        );
      await supabase.from("study_sessions").insert({
        user_id: userId,
        mode: "recall",
        subject: review.title,
        minutes: 2,
        score: quality === "mastered" ? 100 : quality === "good" ? 70 : 30,
        metadata: { skill: review.skill, quality },
      });
    }
  };
  return (
    <div className="card card-pad learning-loop">
      <div className="card-header">
        <div>
          <div className="section-label">Daily learning loop</div>
          <p className="subheading">
            Small reviews now, stronger recall later.
          </p>
        </div>
        <span className="chip">
          {mastered}/{rows.length || 0} building mastery
        </span>
      </div>
      {review ? (
        <div className="review-prompt">
          <span className="eyebrow">
            {review.kind} · {review.skill}
          </span>
          <h2>{review.title}</h2>
          <p className="field-hint">
            Recall the rule, explain it in your own words, or state the next
            step before revealing your notes.
          </p>
          <div className="review-actions">
            <button
              className="secondary-button"
              onClick={() => void mark("again")}
            >
              Again · tomorrow
            </button>
            <button
              className="secondary-button"
              onClick={() => void mark("good")}
            >
              Good · later
            </button>
            <button
              className="primary-button"
              onClick={() => void mark("mastered")}
            >
              Mastered
            </button>
          </div>
        </div>
      ) : (
        <div className="review-prompt">
          <h2>You are caught up.</h2>
          <p className="field-hint">
            Come back tomorrow for the next recall cycle, or practise oral
            advocacy.
          </p>
          <button className="secondary-button" onClick={onOpenArena}>
            Open Legal Arena
          </button>
        </div>
      )}
      <div className="learning-meta">
        <span>{due.length} due now</span>
        <span>{rows.length} topics tracked</span>
        <span>{userId ? "Synced to cloud" : "Offline progress"}</span>
      </div>
    </div>
  );
}
