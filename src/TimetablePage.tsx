import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { Lesson, Member, Unit } from "./data/types";
import { lessonReps, unitReps } from "./data/types";

type Props = {
  lessons: Lesson[];
  units: Unit[];
  members: Member[];
  canDelete: (lesson: Lesson) => boolean;
  canEdit?: (lesson: Lesson) => boolean;
  setNotice: (n: string) => void;
  onAdded: (lesson: Lesson) => void;
  onRemoved: (id: string) => void;
};

const today = () => new Date().toISOString().slice(0, 10);
const hm = (t?: string | null) => (t ? t.slice(0, 5) : "");
const dayLabel = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export default function TimetablePage({
  lessons,
  units,
  members,
  canDelete,
  canEdit,
  setNotice,
  onAdded,
  onRemoved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [viewerName, setViewerName] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [f, setF] = useState({
    unit: "",
    topic: "",
    lesson_date: today(),
    start_time: "",
    end_time: "",
    representatives: [] as string[],
    venue: "",
  });
  const set =
    (
      k: "unit" | "topic" | "lesson_date" | "start_time" | "end_time" | "venue",
    ) =>
    (e: { target: { value: string } }) =>
      setF((c) => ({ ...c, [k]: e.target.value }));
  const chooseUnit = (name: string) =>
    setF((c) => {
      const unit = units.find((u) => u.name === name);
      return {
        ...c,
        unit: name,
        representatives:
          !editing && c.representatives.length === 0
            ? unitReps(unit)
            : c.representatives,
      };
    });
  const toggleRep = (name: string) =>
    setF((c) => ({
      ...c,
      representatives: c.representatives.includes(name)
        ? c.representatives.filter((r) => r !== name)
        : [...c.representatives, name],
    }));
  useEffect(() => {
    void supabase?.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.display_name;
      if (typeof name === "string") setViewerName(name);
    });
  }, []);
  const editAllowed = (lesson: Lesson) => {
    if (canEdit) return canEdit(lesson);
    if (canDelete(lesson)) return true;
    if (!viewerName) return false;
    const unitRepresentatives = unitReps(
      units.find((u) => u.name === lesson.unit),
    );
    return (
      lessonReps(lesson).includes(viewerName) ||
      unitRepresentatives.includes(viewerName)
    );
  };

  const openEdit = (lesson: Lesson) => {
    setEditing(lesson);
    setF({
      unit: lesson.unit,
      topic: lesson.topic,
      lesson_date: lesson.lesson_date,
      start_time: hm(lesson.start_time),
      end_time: hm(lesson.end_time),
      representatives: lessonReps(lesson),
      venue: lesson.venue ?? "",
    });
    setOpen(true);
  };
  const save = async () => {
    if (!f.unit || !f.topic.trim() || !f.lesson_date) {
      setNotice("Pick a unit, a date and add a topic.");
      return;
    }
    try {
      const payload = {
        unit: f.unit,
        topic: f.topic.trim(),
        lesson_date: f.lesson_date,
        start_time: f.start_time || null,
        end_time: f.end_time || null,
        representatives: f.representatives,
        representative: f.representatives[0] ?? null,
        venue: f.venue.trim() || null,
      };
      if (editing) {
        const updated = await repository.updateLesson(editing.id, payload);
        onRemoved(editing.id);
        onAdded(updated);
        setNotice("Lesson updated.");
      } else {
        const created = await repository.createLesson(payload);
        onAdded(created);
        setNotice("Lesson added to the timetable.");
      }
      setOpen(false);
      setEditing(null);
      setF((c) => ({ ...c, topic: "", venue: "" }));
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : editing
            ? "Could not update lesson."
            : "Could not add lesson.",
      );
    }
  };
  const remove = async (l: Lesson) => {
    try {
      await repository.deleteLesson(l.id);
      onRemoved(l.id);
      setNotice("Lesson removed.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not remove lesson.");
    }
  };

  const visible = lessons.filter((l) => showPast || l.lesson_date >= today());
  const days = [...new Set(visible.map((l) => l.lesson_date))].sort();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="heading">Timetable.</h1>
          <p className="subheading">
            Lessons by date and time, with the unit representatives for each.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="secondary-button"
            onClick={() => setShowPast((v) => !v)}
          >
            {showPast ? "Hide past" : "Show past"}
          </button>
          <button className="primary-button" onClick={() => setOpen(true)}>
            <Plus size={14} /> Add lesson
          </button>
        </div>
      </div>
      {days.length === 0 && (
        <div className="card card-pad empty-state">
          <CalendarDays size={22} />
          <p>
            No upcoming lessons yet. Tap “Add lesson” to put the first one on
            the timetable.
          </p>
        </div>
      )}
      {days.map((d) => (
        <div className="card card-pad tt-day" key={d}>
          <div className="section-label">
            {dayLabel(d)}
            {d === today() ? " · Today" : ""}
          </div>
          <div className="row-list">
            {visible
              .filter((l) => l.lesson_date === d)
              .map((l) => (
                <div className="row tt-row" key={l.id}>
                  <div className="tt-time">
                    <Clock3 size={13} />
                    {hm(l.start_time) || "—"}
                    {l.end_time ? `–${hm(l.end_time)}` : ""}
                  </div>
                  <div className="row-main">
                    <div className="row-title">{l.topic}</div>
                    <div className="row-meta">{l.unit}</div>
                    <div className="tt-meta">
                      {lessonReps(l).length > 0 && (
                        <span>
                          <User size={12} /> {lessonReps(l).join(", ")}
                        </span>
                      )}
                      {l.venue && (
                        <span>
                          <MapPin size={12} /> {l.venue}
                        </span>
                      )}
                    </div>
                  </div>
                  {(editAllowed(l) || canDelete(l)) && (
                    <div className="row-end lesson-actions">
                      {editAllowed(l) && (
                        <button
                          className="icon-button"
                          aria-label="Edit lesson"
                          onClick={() => openEdit(l)}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete(l) && (
                        <button
                          className="icon-button"
                          aria-label="Remove lesson"
                          onClick={() => void remove(l)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
      {open && (
        <div className="form-overlay" onClick={() => setOpen(false)}>
          <div
            className="form-card"
            role="dialog"
            aria-label={editing ? "Edit lesson" : "Add lesson"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="detail-title">
              <h2>{editing ? "Edit lesson" : "Add lesson"}</h2>
            </div>
            {units.length === 0 ? (
              <p className="field-hint">
                There are no units yet. The admin needs to add units first.
              </p>
            ) : (
              <div className="tt-form">
                <label>
                  Unit
                  <select
                    value={f.unit}
                    onChange={(e) => chooseUnit(e.target.value)}
                  >
                    <option value="">Choose unit</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Topic
                  <input
                    value={f.topic}
                    onChange={set("topic")}
                    placeholder="e.g. Sources of law"
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={f.lesson_date}
                    onChange={set("lesson_date")}
                  />
                </label>
                <div className="tt-two">
                  <label>
                    Starts
                    <input
                      type="time"
                      value={f.start_time}
                      onChange={set("start_time")}
                    />
                  </label>
                  <label>
                    Ends
                    <input
                      type="time"
                      value={f.end_time}
                      onChange={set("end_time")}
                    />
                  </label>
                </div>
                <div>
                  <div className="field-hint" style={{ marginBottom: 6 }}>
                    Unit representatives (tap to select one or more)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {members.map((m) => {
                      const on = f.representatives.includes(m.name);
                      return (
                        <button
                          type="button"
                          key={m.name}
                          className="chip"
                          aria-pressed={on}
                          onClick={() => toggleRep(m.name)}
                          style={{
                            cursor: "pointer",
                            border: on
                              ? "1px solid var(--ink, #163A34)"
                              : undefined,
                            background: on ? "var(--ink, #163A34)" : undefined,
                            color: on ? "#fff" : undefined,
                          }}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label>
                  Venue
                  <input
                    value={f.venue}
                    onChange={set("venue")}
                    placeholder="Room or online link"
                  />
                </label>
                <div className="tt-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setOpen(false);
                      setEditing(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => void save()}
                  >
                    {editing ? "Update lesson" : "Save lesson"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
