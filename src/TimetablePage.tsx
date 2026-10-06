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
import type { Lesson, Member, SharedTimetableUpload, Unit } from "./data/types";
import { lessonReps, unitReps } from "./data/types";

type Props = {
  lessons: Lesson[];
  units: Unit[];
  members: Member[];
  isAdmin: boolean;
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
const uploadRows = (upload: SharedTimetableUpload) =>
  (Array.isArray(upload.structured_rows) ? upload.structured_rows : [])
    .filter((row) => row?.lesson_date && row?.topic)
    .sort((a, b) =>
      `${a.lesson_date}${a.start_time ?? ""}`.localeCompare(
        `${b.lesson_date}${b.start_time ?? ""}`,
      ),
    );

export default function TimetablePage({
  lessons,
  units,
  members,
  isAdmin,
  canDelete,
  canEdit,
  setNotice,
  onAdded,
  onRemoved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [viewerName, setViewerName] = useState("");
  const [personalLessons, setPersonalLessons] = useState<Lesson[]>([]);
  const [latestUpload, setLatestUpload] = useState<SharedTimetableUpload | null>(null);
  const [schedule, setSchedule] = useState<"personal" | "group">("personal");
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
  useEffect(() => {
    void repository.getPersonalTimetable().then(setPersonalLessons).catch((error) => setNotice(error instanceof Error ? error.message : "Could not load your personal timetable."));
  }, [setNotice]);
  useEffect(() => {
    void repository.getLatestTimetableUpload().then(setLatestUpload).catch(() => setLatestUpload(null));
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel("shared-timetable-upload-preview")
      .on("postgres_changes", { event: "*", schema: "public", table: "shared_timetable_uploads" }, () => {
        void repository.getLatestTimetableUpload().then(setLatestUpload).catch(() => undefined);
      });
    void channel.subscribe();
    return () => { void client.removeChannel(channel); };
  }, []);
  const editAllowed = (lesson: Lesson) => {
    if (schedule === "group") return isAdmin;
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

  const planPreparation = async (lesson: Lesson) => {
    const date = new Date(`${lesson.lesson_date}T00:00:00`);
    date.setDate(date.getDate() - 1);
    if (date.getDay() === 0) date.setDate(date.getDate() - 2);
    if (date.getDay() === 6) date.setDate(date.getDate() - 1);
    const prepDate = date.toISOString().slice(0, 10);
    try {
      const created = await repository.createPersonalLesson({ unit: lesson.unit, topic: `Prepare for ${lesson.topic}`, lesson_date: prepDate, start_time: "18:00", end_time: "19:00", representatives: [], representative: null, venue: "Personal study" });
      setPersonalLessons((current) => [...current, created]);
      await repository.createTodo({ title: `Prepare for ${lesson.topic}`, due: prepDate, completed: false, source: "manual" });
      setSchedule("personal");
      setNotice(`Preparation time added for ${lesson.topic} and placed on your to-do list.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not plan preparation time."); }
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
        const updated = schedule === "personal" ? await repository.updatePersonalLesson(editing.id, payload) : await repository.updateLesson(editing.id, payload);
        if (schedule === "personal") setPersonalLessons((current) => [...current.filter((item) => item.id !== editing.id), updated]);
        else { onRemoved(editing.id); onAdded(updated); }
        setNotice("Lesson updated.");
      } else {
        const created = schedule === "personal" ? await repository.createPersonalLesson(payload) : await repository.createLesson(payload);
        if (schedule === "personal") {
          setPersonalLessons((current) => [...current, created]);
          await repository.createTodo({ title: `Prepare: ${created.topic}`, due: created.lesson_date, completed: false, source: "manual" });
        } else onAdded(created);
        setNotice(schedule === "personal" ? "Personal event added." : "Lesson added to the group timetable.");
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
      if (schedule === "personal") { await repository.deletePersonalLesson(l.id); setPersonalLessons((current) => current.filter((item) => item.id !== l.id)); }
      else { await repository.deleteLesson(l.id); onRemoved(l.id); }
      setNotice(schedule === "personal" ? "Personal event removed." : "Group lesson removed.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not remove lesson.");
    }
  };

  const activeLessons = schedule === "personal" ? personalLessons : lessons;
  const visible = activeLessons.filter((l) => showPast || l.lesson_date >= today());
  const days = [...new Set(visible.map((l) => l.lesson_date))].sort();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="heading">Timetable.</h1>
          <p className="subheading">Choose <strong>My timetable</strong> for private study events, or <strong>Group timetable</strong> for the shared class schedule.</p>
        </div>
        <div className="page-actions timetable-tabs" aria-label="Timetable view">
          <button className={schedule === "personal" ? "primary-button" : "secondary-button"} onClick={() => setSchedule("personal")}>My timetable</button>
          <button className={schedule === "group" ? "primary-button" : "secondary-button"} onClick={() => setSchedule("group")}>Group timetable</button>
          <button
            className="secondary-button"
            onClick={() => setShowPast((v) => !v)}
          >
            {showPast ? "Hide past lessons" : "Show past lessons"}
          </button>
          {(schedule === "personal" || isAdmin) && <button className="primary-button" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus size={14} /> {schedule === "personal" ? "Add personal event" : "Add group lesson"}
          </button>}
        </div>
      </div>
      {schedule === "group" && latestUpload && (
        <div className="card card-pad shared-upload-card">
          <div className="section-label">Shared admin upload</div>
          <div className="shared-upload-title">{latestUpload.filename}</div>
          <p className="field-hint">
            Uploaded {new Date(latestUpload.created_at).toLocaleString("en-GB")} · {latestUpload.structured_rows.length} structured rows · visible to everyone signed in.
          </p>
          {uploadRows(latestUpload).length > 0 ? (
            <div className="shared-upload-preview">
              <div className="shared-upload-preview-heading">Uploaded timetable structure</div>
              <div className="shared-upload-grid" role="table" aria-label="Uploaded timetable preview">
                <div className="shared-upload-grid-head" role="row">
                  <span>Date</span><span>Time</span><span>Unit / topic</span><span>Venue</span><span>Representative</span>
                </div>
                {uploadRows(latestUpload).map((row, index) => (
                  <div className="shared-upload-grid-row" role="row" key={`${row.lesson_date}-${row.topic}-${index}`}>
                    <span>{dayLabel(row.lesson_date)}</span>
                    <span>{hm(row.start_time) || "—"}{row.end_time ? `–${hm(row.end_time)}` : ""}</span>
                    <span><strong>{row.unit || "General"}</strong><small>{row.topic}</small></span>
                    <span>{row.venue || "—"}</span>
                    <span>{lessonReps(row).join(", ") || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="field-hint">{isAdmin ? "No structured rows have been generated yet. Use the timetable planner to create the shared structure." : "The administrator is preparing the structured timetable preview."}</p>
          )}
          {isAdmin && latestUpload.extracted_text ? (
            <details>
              <summary>View original uploaded source (admin only)</summary>
              <pre className="shared-upload-text">{latestUpload.extracted_text}</pre>
            </details>
          ) : null}
        </div>
      )}
      {days.length === 0 && (
        <div className="card card-pad empty-state">
          <CalendarDays size={22} />
          <p>
            No upcoming {schedule === "personal" ? "personal events" : "Group 13 lessons"} yet. Tap “Add lesson” to put the first one here.
          </p>
        </div>
      )}
      {schedule === "personal" && lessons.filter((lesson) => lesson.lesson_date >= today()).slice(0, 3).length > 0 && (
        <div className="card card-pad personal-group-context"><div className="section-label">Plan around your group timetable</div><p className="field-hint">Your next group lessons are shown here. Add preparation time and it will also appear on your personal to-do list.</p><div className="row-list">{lessons.filter((lesson) => lesson.lesson_date >= today()).slice(0, 3).map((lesson) => <div className="row" key={`plan-${lesson.id}`}><div className="row-main"><div className="row-title">{lesson.topic}</div><div className="row-meta">{lesson.lesson_date} · {lesson.unit}</div></div><button className="secondary-button" onClick={() => void planPreparation(lesson)}>Plan prep</button></div>)}</div></div>
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
                  {(schedule === "personal" || isAdmin) && (
                    <div className="row-end lesson-actions">
                      {(schedule === "personal" || isAdmin) && (
                        <button
                          className="icon-button"
                          aria-label="Edit lesson"
                          onClick={() => openEdit(l)}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {(schedule === "personal" || isAdmin) && (
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
              <h2>{editing ? "Edit event" : schedule === "personal" ? "Add personal event" : "Add group lesson"}</h2>
            </div>
            {schedule === "group" && units.length === 0 ? (
              <p className="field-hint">
                There are no units yet. The admin needs to add units first.
              </p>
            ) : (
              <div className="tt-form">
                <label>
                  {schedule === "personal" ? "Subject or study label" : "Unit"}
                  {schedule === "personal" ? (
                    <input
                      value={f.unit}
                      onChange={(e) => setF((current) => ({ ...current, unit: e.target.value }))}
                      placeholder="e.g. Constitutional Law revision"
                    />
                  ) : (
                    <select value={f.unit} onChange={(e) => chooseUnit(e.target.value)}>
                      <option value="">Choose unit</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  )}
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
                    {schedule === "personal" ? "People or group involved (optional)" : "Unit representatives (tap to select one or more)"}
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
