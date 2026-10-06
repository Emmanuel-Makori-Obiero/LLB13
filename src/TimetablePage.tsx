import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock3,
  FileUp,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { Lesson, Member, SharedTimetableUpload, Unit } from "./data/types";
import { lessonReps, unitReps } from "./data/types";
import { askAI, extractText } from "./lib/ai";

type PersonalProposal = { title: string; rationale: string; lessons: Omit<Lesson, "id" | "created_by">[] };
type ReplanAction = { action: "add" | "update" | "cancel"; lesson_id?: string; lesson?: Omit<Lesson, "id" | "created_by">; reason: string };
type ReplanProposal = { title: string; rationale: string; actions: ReplanAction[] };
function parseAIJson(value: string): unknown {
  const clean = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean);
}

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
const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const weekdayOf = (date: string) => weekdayNames[new Date(`${date}T00:00:00`).getDay()];
const studyBlockPattern = /\b(study|studying|write|writing|course notes?|review|revise|revision|read|reading|research|assignment|quiz|exam preparation|prepare for)\b/i;
function extractNoStudyWeekdays(instruction: string) {
  const blocked = new Set<string>();
  for (const day of weekdayNames) {
    const escaped = day.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const explicit = new RegExp(`(?:not\\s+supposed\\s+to|do\\s+not|don't|no|avoid)[^.!?\\n]{0,100}\\b${escaped}\\b`, "i").test(instruction)
      || new RegExp(`\\b${escaped}\\b[^.!?\\n]{0,60}(?:not\\s+included|no\\s+study|without\\s+study)`, "i").test(instruction);
    if (explicit) blocked.add(day);
  }
  return blocked;
}
function removeForbiddenStudyBlocks<T extends { lesson_date: string; topic: string; unit: string }>(lessons: T[], blockedWeekdays: Set<string>) {
  return lessons.filter((lesson) => !(blockedWeekdays.has(weekdayOf(lesson.lesson_date)) && studyBlockPattern.test(`${lesson.topic} ${lesson.unit}`)));
}
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
  const [personalInstruction, setPersonalInstruction] = useState("");
  const [personalUploadText, setPersonalUploadText] = useState("");
  const [personalUploadName, setPersonalUploadName] = useState("");
  const [personalAIBusy, setPersonalAIbusy] = useState(false);
  const [personalProposal, setPersonalProposal] = useState<PersonalProposal | null>(null);
  const [replanInstruction, setReplanInstruction] = useState("");
  const [replanProposal, setReplanProposal] = useState<ReplanProposal | null>(null);
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

  const readPersonalTimetableFile = async (file?: File) => {
    if (!file) return;
    try {
      setPersonalUploadName(file.name);
      setPersonalUploadText((await extractText(file)).slice(0, 16000));
      setNotice(`${file.name} is ready as optional context for your personal plan.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not read that timetable file."); }
  };

  const generatePersonalProposal = async () => {
    if (!personalInstruction.trim() || personalAIBusy) { if (!personalInstruction.trim()) setNotice("Describe your routine, commitments and goals first."); return; }
    setPersonalAIbusy(true);
    try {
      const blockedStudyWeekdays = extractNoStudyWeekdays(personalInstruction);
      const groupContext = lessons.filter((lesson) => lesson.lesson_date >= today()).slice(0, 80).map((lesson) => ({ unit: lesson.unit, topic: lesson.topic, date: lesson.lesson_date, start: hm(lesson.start_time), end: hm(lesson.end_time), venue: lesson.venue }));
      const hardConstraint = blockedStudyWeekdays.size
        ? `HARD CONSTRAINT: Do not create any study, course-note, revision, review, reading, research, assignment, or exam-preparation block on ${[...blockedStudyWeekdays].join(", ")}. These days are unavailable for study and must not appear in the study timetable. `
        : "";
      const response = await askAI({ feature: "personal_timetable_proposal", mode: "general", messages: [{ role: "user", content: `Create a personal weekly timetable proposal for a Kenyan law student. Current date: ${today()}. Student's description: ${personalInstruction.trim()}. ${hardConstraint}Treat explicit unavailable days and fixed commitments in the student's description as non-negotiable constraints. Optional uploaded timetable (${personalUploadName || "none"})—treat as user context, not verified group authority: ${personalUploadText || "none"}. Current shared group timetable—do not move or overwrite these classes: ${JSON.stringify(groupContext)}. Return the exact JSON contract required by the feature. Include study blocks and any extracurricular activities the student requested. Avoid clashes with group lessons, preserve sleep/meals/commute where described, and use realistic dates on or after today. One block per line.` }] });
      const raw = (response.data && typeof response.data === "object" ? response.data : parseAIJson(response.answer)) as { title?: unknown; rationale?: unknown; lessons?: unknown };
      const proposedRaw = Array.isArray(raw.lessons) ? raw.lessons.map((item) => { const value = item as Record<string, unknown>; return { unit: String(value.unit ?? "Personal study"), topic: String(value.topic ?? "Study block"), lesson_date: String(value.lesson_date ?? "").slice(0, 10), start_time: String(value.start_time ?? "").slice(0, 5) || null, end_time: String(value.end_time ?? "").slice(0, 5) || null, representatives: [], representative: null, venue: String(value.venue ?? "Personal") }; }).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.lesson_date) && item.topic) : [];
      const proposed = removeForbiddenStudyBlocks(proposedRaw, blockedStudyWeekdays);
      if (!proposed.length) throw new Error("The AI did not return any usable timetable blocks. Try describing your available days and times more clearly.");
      const removedCount = proposedRaw.length - proposed.length;
      setPersonalProposal({ title: String(raw.title ?? "Personal AI timetable proposal"), rationale: String(raw.rationale ?? "Balanced around your group classes and stated commitments."), lessons: proposed });
      setNotice(`${removedCount ? `${removedCount} study block${removedCount === 1 ? "" : "s"} removed from your unavailable day. ` : ""}Your personal plan is ready. Review it carefully, then approve it to add the blocks and to-do items.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not generate your personal AI timetable."); }
    finally { setPersonalAIbusy(false); }
  };

  const approvePersonalProposal = async () => {
    if (!personalProposal || personalAIBusy) return;
    setPersonalAIbusy(true);
    try {
      const created = await Promise.all(personalProposal.lessons.map((lesson) => repository.createPersonalLesson(lesson)));
      await Promise.all(created.map((lesson) => repository.createTodo({ title: `Prepare: ${lesson.topic}`, due: lesson.lesson_date, completed: false, source: "manual" })));
      setPersonalLessons((current) => [...current, ...created]);
      setPersonalProposal(null);
      setNotice(`${created.length} personal timetable blocks approved and added to your to-do list.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not apply the personal timetable proposal."); }
    finally { setPersonalAIbusy(false); }
  };

  const generateReplanProposal = async () => {
    if (!replanInstruction.trim() || personalAIBusy) { if (!replanInstruction.trim()) setNotice("Describe what changed first, such as a missed day, urgent deadline, cancellation, or new commitment."); return; }
    setPersonalAIbusy(true);
    try {
      const current = personalLessons.filter((lesson) => lesson.lesson_date >= today()).map((lesson) => ({ id: lesson.id, unit: lesson.unit, topic: lesson.topic, lesson_date: lesson.lesson_date, start_time: hm(lesson.start_time) || null, end_time: hm(lesson.end_time) || null, venue: lesson.venue }));
      const groupContext = lessons.filter((lesson) => lesson.lesson_date >= today()).slice(0, 80).map((lesson) => ({ unit: lesson.unit, topic: lesson.topic, date: lesson.lesson_date, start: hm(lesson.start_time), end: hm(lesson.end_time) }));
      const response = await askAI({ feature: "personal_timetable_proposal", mode: "general", messages: [{ role: "user", content: `Replan a student's private timetable. Today is ${today()}. The student says: ${replanInstruction.trim()}\n\nCURRENT PERSONAL TIMETABLE (only these future items may be updated or cancelled):\n${JSON.stringify(current)}\n\nUPCOMING GROUP CLASSES (do not move or cancel these):\n${JSON.stringify(groupContext)}\n\nInterpret ordinary language carefully: “I missed today” means move unfinished work to the next realistic available day; “deadline tomorrow” means prioritize the work before tomorrow and reduce or move lower-priority blocks; “cancel” removes the matching personal item; a new responsibility may require adding an item. Preserve unaffected events. Use ISO dates on or after today, valid times, and avoid clashes. Return ONLY this JSON shape: {"title":"...","rationale":"...","actions":[{"action":"add|update|cancel","lesson_id":"existing id for update/cancel, omitted for add","lesson":{"unit":"...","topic":"...","lesson_date":"YYYY-MM-DD","start_time":"HH:MM or null","end_time":"HH:MM or null","representatives":[],"representative":null,"venue":"Personal"},"reason":"..."}]}. For cancel, omit lesson. For update, include the complete replacement lesson. If no change is needed, return an empty actions array.` }] });
      const raw = (response.data && typeof response.data === "object" ? response.data : parseAIJson(response.answer)) as { title?: unknown; rationale?: unknown; actions?: unknown };
      const currentIds = new Set(personalLessons.map((lesson) => lesson.id));
      const actions = Array.isArray(raw.actions) ? raw.actions.map((item) => {
        const value = item as Record<string, unknown>;
        const action = value.action === "add" || value.action === "update" || value.action === "cancel" ? value.action : null;
        const lessonId = typeof value.lesson_id === "string" ? value.lesson_id : undefined;
        const source = (value.lesson && typeof value.lesson === "object" ? value.lesson : {}) as Record<string, unknown>;
        const lesson = action === "cancel" ? undefined : { unit: String(source.unit ?? "Personal study"), topic: String(source.topic ?? "Study block"), lesson_date: String(source.lesson_date ?? "").slice(0, 10), start_time: String(source.start_time ?? "").slice(0, 5) || null, end_time: String(source.end_time ?? "").slice(0, 5) || null, representatives: [], representative: null, venue: String(source.venue ?? "Personal") };
        return action ? ({ action, ...(lessonId ? { lesson_id: lessonId } : {}), ...(lesson ? { lesson } : {}), reason: String(value.reason ?? "Updated from your description.") } as ReplanAction) : null;
      }).filter((item): item is ReplanAction => {
        if (!item) return false;
        if (item.action === "cancel") return Boolean(item.lesson_id && currentIds.has(item.lesson_id));
        return Boolean(item.lesson && /^\d{4}-\d{2}-\d{2}$/.test(item.lesson.lesson_date) && (item.action === "add" || (item.action === "update" && item.lesson_id && currentIds.has(item.lesson_id))));
      }) : [];
      setReplanProposal({ title: String(raw.title ?? "Personal timetable update"), rationale: String(raw.rationale ?? "Your timetable was adapted around the change you described."), actions });
      setNotice(actions.length ? "A timetable update is ready. Review each change before applying it." : "No timetable changes were needed for that description.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not adapt your personal timetable."); }
    finally { setPersonalAIbusy(false); }
  };

  const applyReplanProposal = async () => {
    if (!replanProposal || personalAIBusy) return;
    setPersonalAIbusy(true);
    try {
      let next = [...personalLessons];
      for (const action of replanProposal.actions) {
        if (action.action === "cancel" && action.lesson_id) { await repository.deletePersonalLesson(action.lesson_id); next = next.filter((lesson) => lesson.id !== action.lesson_id); }
        if (action.action === "update" && action.lesson_id && action.lesson) { const updated = await repository.updatePersonalLesson(action.lesson_id, action.lesson); next = next.map((lesson) => lesson.id === action.lesson_id ? updated : lesson); }
        if (action.action === "add" && action.lesson) { const created = await repository.createPersonalLesson(action.lesson); await repository.createTodo({ title: `Prepare: ${created.topic}`, due: created.lesson_date, completed: false, source: "manual" }); next.push(created); }
      }
      setPersonalLessons(next); setReplanProposal(null); setReplanInstruction("");
      setNotice(`${replanProposal.actions.length} timetable change${replanProposal.actions.length === 1 ? "" : "s"} applied.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not apply the timetable changes."); }
    finally { setPersonalAIbusy(false); }
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
      {schedule === "personal" && <div className="card card-pad personal-ai-builder"><div className="game-kicker"><Sparkles size={14} /> Personal AI timetable coach</div><h2>Describe your life. Get a plan.</h2><p>Tell the coach about your classes, sleep, work, family responsibilities, commute, goals and extracurricular activities. Uploading a timetable is optional. The coach checks the current group timetable automatically and proposes a plan for your approval.</p><label className="personal-ai-label">Your routine and goals<textarea rows={5} value={personalInstruction} onChange={(event) => setPersonalInstruction(event.target.value)} placeholder="Example: I work Monday to Friday until 5pm, sleep by 10:30pm, commute for an hour, want to revise Constitutional Law and play football on Saturday morning…" /></label><label className="personal-ai-upload"><FileUp size={15} /> Optional timetable upload<input type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv" onChange={(event) => void readPersonalTimetableFile(event.target.files?.[0])} />{personalUploadName && <span>{personalUploadName} ready</span>}</label><button className="primary-button" onClick={() => void generatePersonalProposal()} disabled={personalAIBusy || !personalInstruction.trim()}>{personalAIBusy ? "Building your personal plan…" : "Propose my timetable"}</button></div>}
      {schedule === "personal" && <div className="card card-pad personal-ai-replanner"><div className="game-kicker"><Sparkles size={14} /> Adapt my current timetable</div><h2>Tell it what changed.</h2><p>Describe a missed day, an urgent deadline, a cancellation, or a new commitment. The coach will propose only the necessary additions, moves, and cancellations; nothing changes until you approve it.</p><textarea rows={3} value={replanInstruction} onChange={(event) => { setReplanInstruction(event.target.value); setReplanProposal(null); }} placeholder="Example: I could not study Constitutional Law today. The assignment is due tomorrow, so move tonight’s football block and put a two-hour assignment block tomorrow morning." /><button className="secondary-button" onClick={() => void generateReplanProposal()} disabled={personalAIBusy || !replanInstruction.trim()}>{personalAIBusy ? "Replanning…" : "Review timetable changes"}</button></div>}
      {replanProposal && schedule === "personal" && <div className="card card-pad personal-ai-proposal"><div className="section-label">Review timetable changes</div><h2>{replanProposal.title}</h2><p>{replanProposal.rationale}</p><div className="row-list">{replanProposal.actions.map((action, index) => <div className="row" key={`${action.action}-${action.lesson_id ?? "new"}-${index}`}><div className="row-main"><div className="row-title">{action.action === "add" ? "Add" : action.action === "update" ? "Move / update" : "Cancel"}: {action.lesson?.topic ?? personalLessons.find((lesson) => lesson.id === action.lesson_id)?.topic ?? "personal event"}</div><div className="row-meta">{action.lesson ? `${action.lesson.lesson_date} · ${hm(action.lesson.start_time)}–${hm(action.lesson.end_time)}` : "Existing timetable event"} · {action.reason}</div></div></div>)}</div><div className="arena-invite-actions"><button className="primary-button" onClick={() => void applyReplanProposal()} disabled={personalAIBusy}>Apply these changes</button><button className="secondary-button" onClick={() => setReplanProposal(null)} disabled={personalAIBusy}>Discard proposal</button></div></div>}
      {personalProposal && schedule === "personal" && <div className="card card-pad personal-ai-proposal"><div className="section-label">Review before applying</div><h2>{personalProposal.title}</h2><p>{personalProposal.rationale}</p><div className="row-list">{personalProposal.lessons.map((lesson, index) => <div className="row" key={`${lesson.lesson_date}-${lesson.topic}-${index}`}><div className="row-main"><div className="row-title">{lesson.topic}</div><div className="row-meta">{lesson.lesson_date} · {hm(lesson.start_time)}–{hm(lesson.end_time)} · {lesson.venue || "Personal"}</div></div></div>)}</div><div className="arena-invite-actions"><button className="primary-button" onClick={() => void approvePersonalProposal()} disabled={personalAIBusy}>Approve and add to my timetable</button><button className="secondary-button" onClick={() => setPersonalProposal(null)} disabled={personalAIBusy}>Keep editing description</button></div></div>}
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
