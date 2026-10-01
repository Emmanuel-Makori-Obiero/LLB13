import { useEffect, useMemo, useState } from "react";
import type { Assignment, Lesson } from "./data/types";

type Review = {
  id: string;
  title: string;
  kind: string;
  due: number;
  interval: number;
  seen: number;
  skill: string;
};
const KEY = "group13.learning-loop.v1";
const DAY = 86_400_000;

function read(): Review[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Review[];
  } catch {
    return [];
  }
}
function save(rows: Review[]) {
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export default function LearningLoop({
  assignments,
  lessons,
  onOpenArena,
}: {
  assignments: Assignment[];
  lessons: Lesson[];
  onOpenArena: () => void;
}) {
  const seeds = useMemo(
    () => [
      ...assignments.map((a) => ({
        id: `assignment:${a.id}`,
        title: a.title,
        kind: "Assignment",
        skill: a.unit,
      })),
      ...lessons.slice(0, 12).map((l) => ({
        id: `lesson:${l.id}`,
        title: l.topic,
        kind: "Lesson",
        skill: l.unit,
      })),
    ],
    [assignments, lessons],
  );
  const [rows, setRows] = useState<Review[]>(() => read());
  useEffect(() => {
    const current = new Map(rows.map((r) => [r.id, r]));
    let changed = false;
    const next = seeds.map(
      (seed) =>
        current.get(seed.id) ?? {
          ...seed,
          due: Date.now(),
          interval: 0,
          seen: 0,
        },
    );
    if (next.length !== rows.length) changed = true;
    if (changed) {
      setRows(next);
      save(next);
    }
  }, [seeds]);
  const due = rows.filter((r) => r.due <= Date.now());
  const mastered = rows.filter((r) => r.interval >= 14).length;
  const review = due[0];
  const mark = (quality: "again" | "good" | "mastered") => {
    if (!review) return;
    const next = rows.map((r) =>
      r.id !== review.id
        ? r
        : quality === "again"
          ? { ...r, due: Date.now() + DAY, interval: 0, seen: r.seen + 1 }
          : quality === "good"
            ? {
                ...r,
                due: Date.now() + Math.max(1, r.interval * 2 || 2) * DAY,
                interval: Math.max(1, r.interval * 2 || 2),
                seen: r.seen + 1,
              }
            : {
                ...r,
                due: Date.now() + 30 * DAY,
                interval: 30,
                seen: r.seen + 1,
              },
    );
    setRows(next);
    save(next);
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
            <button className="secondary-button" onClick={() => mark("again")}>
              Again · tomorrow
            </button>
            <button className="secondary-button" onClick={() => mark("good")}>
              Good · later
            </button>
            <button className="primary-button" onClick={() => mark("mastered")}>
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
        <span>Intervals grow: 1d → 2d → 4d → 8d → 14d</span>
      </div>
    </div>
  );
}
