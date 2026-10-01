import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Globe,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  NotebookPen,
  NotebookText,
  Trash2,
} from "lucide-react";
import { supabase } from "./data/repository";
import { Markdown } from "./Markdown";
import {
  askAI,
  saveTextMaterial,
  type AIFeature,
  type AIResult,
} from "./lib/ai";
import { Answer, type Turn } from "./StudyAssistant";
import "./assistant.css";
import { downloadBlob, downloadPdf, downloadWord } from "./export";

const SECTIONS_PER_PART = 6; // sections read per request: small enough for free-tier token limits
const WAITS = [0, 25_000, 50_000]; // retry pauses when every AI provider is busy
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Action = {
  feature: AIFeature;
  label: string;
  icon: typeof NotebookText;
  prompt: string;
  hint: string;
};

const ACTIONS: Action[] = [
  {
    feature: "notes",
    label: "Make notes",
    icon: NotebookPen,
    hint: "Full, organised notes in lecture order. Nothing important left out.",
    prompt: "Write complete study notes for this part of the lecture.",
  },
  {
    feature: "summarize",
    label: "Summarise",
    icon: NotebookText,
    hint: "A short overview of the main points.",
    prompt:
      "This is a lecture transcript. Summarise it as clear lecture notes: the main topics in order, the key rules and principles, every case and statute mentioned, and any exam tips or warnings the lecturer gave. Ignore filler and repetition.",
  },
  {
    feature: "quiz",
    label: "Quiz",
    icon: ListChecks,
    hint: "Multiple-choice questions on this lecture.",
    prompt:
      "Create 8 multiple-choice questions testing the main points of this lecture transcript.",
  },
  {
    feature: "flashcards",
    label: "Flashcards",
    icon: Layers,
    hint: "Flip cards for revision.",
    prompt:
      "Create 12 flashcards covering the key rules, terms and cases from this lecture transcript.",
  },
  {
    feature: "extract_assignments",
    label: "Find assignments",
    icon: ListChecks,
    hint: "Find coursework, deadlines and explicit tasks mentioned in this lesson.",
    prompt:
      "Scan this lecture transcript for assignments, coursework, essay questions, presentations, readings, deadlines or explicit tasks. Return only items clearly mentioned in the transcript; do not invent anything.",
  },
];

type Visibility = "private" | "group";
type NoteKind = "notes" | "summary";
type SavedNote = {
  id: string;
  owner: string;
  owner_name: string | null;
  kind: NoteKind;
  content: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
};
type ExtractedAssignment = {
  localId: string;
  title: string;
  brief: string;
  due: string;
  confidence: number;
  source_excerpt: string;
  status: "pending" | "accepted" | "rejected";
};

export function TranscriptAI({
  transcriptId,
  userId,
  title,
  unit,
  ownerName = "Group 13 member",
  getText,
  ready,
}: {
  transcriptId: string;
  userId: string | null;
  title: string;
  unit?: string | null;
  ownerName?: string;
  getText: () => string;
  ready: boolean; // false while the transcript text is still loading
}) {
  const [busy, setBusy] = useState<AIFeature | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [step, setStep] = useState("");
  const [notesText, setNotesText] = useState("");
  const saved = useRef<{ id: string; chunks: number } | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [reload, setReload] = useState(0);
  const [extracted, setExtracted] = useState<ExtractedAssignment[]>([]);
  const [assignmentMsg, setAssignmentMsg] = useState("");

  const mkTask = (a: Action) => ({
    feature: a.feature,
    label: a.label,
    placeholder: "",
  });

  const download = () => {
    downloadBlob(
      new Blob([`# ${title}\n\n${notesText || turn?.result?.answer || ""}`], {
        type: "text/markdown",
      }),
      `${title.replace(/[^\w\- ]+/g, "").trim() || "lecture"} - ${turn?.task.feature === "summarize" ? "summary" : "notes"}.md`,
    );
  };
  const generatedText = notesText || turn?.result?.answer || "";
  const downloadNotesPdf = () =>
    downloadPdf(
      title,
      generatedText,
      `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "lecture"}-${turn?.task.feature === "summarize" ? "summary" : "notes"}.pdf`,
    );
  const downloadNotesWord = () =>
    downloadWord(
      title,
      generatedText,
      `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "lecture"}-${turn?.task.feature === "summarize" ? "summary" : "notes"}.doc`,
    );

  const run = async (action: Action) => {
    if (busy) return;
    const task = mkTask(action);
    if (!ready) {
      setTurn({
        id: 1,
        task,
        prompt: "",
        error: "The transcript is still loading. Try again in a moment.",
      });
      return;
    }
    setBusy(action.feature);
    setTurn(null);
    setNotesText("");
    try {
      // Save the transcript once per visit so every button reads the same copy.
      if (!saved.current) {
        setStep("Preparing the transcript");
        saved.current = await saveTextMaterial(
          `${title} (lecture transcript)`,
          getText(),
        );
      }
      const doc = saved.current;

      if (action.feature === "notes") {
        const parts = Math.max(1, Math.ceil(doc.chunks / SECTIONS_PER_PART));
        const done: string[] = [];
        let last: AIResult | null = null;
        for (let i = 0; i < parts; i++) {
          setStep(`Writing notes, part ${i + 1} of ${parts}`);
          try {
            let got: AIResult | null = null;
            let failure: Error | null = null;
            for (let attempt = 0; attempt < WAITS.length && !got; attempt++) {
              if (attempt > 0) {
                setStep(
                  `Part ${i + 1} of ${parts}: the AI is busy, retrying in ${WAITS[attempt] / 1000}s`,
                );
                await sleep(WAITS[attempt]);
                setStep(
                  `Writing notes, part ${i + 1} of ${parts} (attempt ${attempt + 1})`,
                );
              }
              try {
                got = await askAI({
                  feature: "notes",
                  mode: "materials",
                  messages: [{ role: "user", content: action.prompt }],
                  docIds: [doc.id],
                  part: i,
                  size: SECTIONS_PER_PART,
                });
              } catch (err) {
                failure = err as Error;
                if (!/busy|unavailable/i.test(failure.message)) break; // retrying will not help
              }
            }
            if (!got)
              throw (
                failure ?? new Error("The assistant is unavailable right now.")
              );
            last = got;
          } catch (e) {
            const shown = done.join("\n\n---\n\n");
            setNotesText(shown);
            setTurn({
              id: 1,
              task,
              prompt: action.prompt,
              error: `Notes stopped at part ${i + 1} of ${parts}: ${(e as Error).message} ${
                done.length ? `Parts 1 to ${done.length} are shown below.` : ""
              } Press Make notes to try again.`,
              result:
                done.length && last
                  ? { ...last, answer: shown, warnings: [], sources: [] }
                  : undefined,
            });
            return;
          }
          done.push(last.answer.trim());
          // show progress as each part arrives
          const shown = done.join("\n\n---\n\n");
          setNotesText(shown);
          setTurn({
            id: 1,
            task,
            prompt: action.prompt,
            result: { ...last, answer: shown, warnings: [], sources: [] },
          });
        }
        return;
      }

      setStep(`${action.label} in progress`);
      const result = await askAI({
        feature: action.feature,
        mode: "materials",
        messages: [{ role: "user", content: action.prompt }],
        docIds: [doc.id],
      });
      if (action.feature === "extract_assignments") {
        const raw = result.data as { assignments?: unknown[] } | null;
        const rows = Array.isArray(raw?.assignments)
          ? raw.assignments
              .map((item, index) => {
                const row = item as Record<string, unknown>;
                return {
                  localId: `${transcriptId}-${index}-${Date.now()}`,
                  title: String(row.title ?? "").trim(),
                  brief: String(row.brief ?? "").trim(),
                  due: String(row.due ?? "").trim(),
                  confidence: Math.max(
                    0,
                    Math.min(1, Number(row.confidence ?? 0)),
                  ),
                  source_excerpt: String(row.source_excerpt ?? "").trim(),
                  status: "pending" as const,
                };
              })
              .filter((row) => row.title)
          : [];
        setExtracted(rows);
        setAssignmentMsg(
          rows.length
            ? "Review the suggested assignments before adding them."
            : "No clear assignments were found in this lesson.",
        );
      }
      setTurn({ id: 1, task, prompt: action.prompt, result });
    } catch (e) {
      setTurn({
        id: 1,
        task,
        prompt: action.prompt,
        error: (e as Error).message,
      });
    } finally {
      setBusy(null);
      setStep("");
    }
  };
  const acceptAssignment = async (row: ExtractedAssignment) => {
    if (!supabase || !userId) return;
    setAssignmentMsg("Adding assignment…");
    const assignmentId = `ai-${crypto.randomUUID()}`;
    const { error: assignmentError } = await supabase
      .from("assignments")
      .insert({
        id: assignmentId,
        title: row.title,
        unit: unit ?? "Unassigned",
        due: row.due || "Not set",
        status: "Not Started",
        owner: ownerName,
        reviewer: "Unassigned",
        brief:
          row.brief ||
          row.source_excerpt ||
          "Extracted from a lesson transcript.",
      });
    if (assignmentError) {
      setAssignmentMsg(assignmentError.message);
      return;
    }
    const { error: extractionError } = await supabase
      .from("assignment_extractions")
      .insert({
        transcript_id: transcriptId,
        title: row.title,
        unit: unit ?? "",
        due: row.due,
        brief: row.brief,
        source_excerpt: row.source_excerpt,
        confidence: row.confidence,
        status: "accepted",
        assignment_id: assignmentId,
      });
    if (extractionError) {
      setAssignmentMsg(
        "Assignment added, but the extraction record could not be saved. Run the assignment migration.",
      );
      return;
    }
    setExtracted((rows) =>
      rows.map((item) =>
        item.localId === row.localId ? { ...item, status: "accepted" } : item,
      ),
    );
    setAssignmentMsg("Assignment added to the group assignments list.");
  };
  const rejectAssignment = (row: ExtractedAssignment) => {
    setExtracted((rows) =>
      rows.map((item) =>
        item.localId === row.localId ? { ...item, status: "rejected" } : item,
      ),
    );
  };

  const saveNote = async () => {
    if (!supabase || !turn?.result || !userId) return;
    const kind = turn.task.feature as NoteKind;
    // Source tags like [S1] only make sense next to the source list, so drop them.
    const content = turn.result.answer.replace(/\s?\[S\d+\]/g, "").trim();
    setSaving(true);
    setSaveMsg("");
    const { error } = await supabase.from("transcript_notes").upsert(
      {
        transcript_id: transcriptId,
        owner: userId,
        kind,
        content,
        visibility,
      },
      { onConflict: "transcript_id,owner,kind" },
    );
    setSaving(false);
    if (error) {
      setSaveMsg(
        "Could not save. Ask your admin to run supabase/transcript-notes.sql.",
      );
      return;
    }
    setSaveMsg(
      visibility === "group"
        ? "Saved and shared with Group 13."
        : "Saved. Only you can see it.",
    );
    setReload((n) => n + 1);
  };

  const textual =
    turn?.result &&
    (turn.task.feature === "summarize" || turn.task.feature === "notes");

  return (
    <div className="ta">
      <div className="ta-bar">
        <span className="section-label">Study tools</span>
        <div className="ta-buttons">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.feature}
                type="button"
                title={a.hint}
                className={`secondary-button ta-btn ${a.feature === "notes" ? "ta-main" : ""}`}
                disabled={busy !== null}
                onClick={() => void run(a)}
              >
                {busy === a.feature ? (
                  <Loader2 size={13} className="sa-spin" />
                ) : (
                  <Icon size={13} />
                )}{" "}
                {a.label}
              </button>
            );
          })}
        </div>
      </div>
      {busy && (
        <p className="ta-step">
          <Loader2 size={13} className="sa-spin" /> {step}. Long lectures take a
          few minutes.
        </p>
      )}
      {turn && (
        <div className="ta-result">
          {turn.task.feature !== "extract_assignments" && (
            <Answer turn={turn} />
          )}
          {turn.task.feature === "extract_assignments" && (
            <div className="ta-assignment-review">
              <p className="subheading">
                The AI found these possible tasks. Confirm each one before it
                enters the group assignments list.
              </p>
              {extracted.map((row) => (
                <div className="ta-assignment" key={row.localId}>
                  <div>
                    <strong>{row.title}</strong>
                    {row.brief && <p>{row.brief}</p>}
                    <small>
                      {row.due ? `Due: ${row.due}` : "No deadline stated"} ·{" "}
                      {Math.round(row.confidence * 100)}% confidence
                    </small>
                    {row.source_excerpt && (
                      <blockquote>{row.source_excerpt}</blockquote>
                    )}
                  </div>
                  <div className="ta-assignment-actions">
                    {row.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => void acceptAssignment(row)}
                        >
                          Add assignment
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => rejectAssignment(row)}
                        >
                          Discard
                        </button>
                      </>
                    ) : (
                      <span className="chip">
                        {row.status === "accepted" ? "Added" : "Discarded"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {assignmentMsg && <p className="field-hint">{assignmentMsg}</p>}
            </div>
          )}
          {textual && !busy && (
            <div className="ta-after">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void navigator.clipboard?.writeText(turn.result!.answer)
                }
              >
                Copy {turn.task.feature === "notes" ? "notes" : "summary"}
              </button>
              {textual && (
                <>
                  <button
                    type="button"
                    className="secondary-button ta-btn"
                    onClick={download}
                  >
                    <Download size={13} /> Download .md
                  </button>
                  <button
                    type="button"
                    className="secondary-button ta-btn"
                    onClick={downloadNotesPdf}
                  >
                    <Download size={13} /> Download PDF
                  </button>
                  <button
                    type="button"
                    className="secondary-button ta-btn"
                    onClick={downloadNotesWord}
                  >
                    <Download size={13} /> Download Word
                  </button>
                </>
              )}
            </div>
          )}
          {textual && !busy && userId && (
            <div className="ta-share">
              <div className="ta-share-choice" role="radiogroup">
                <label className={visibility === "private" ? "on" : ""}>
                  <input
                    type="radio"
                    name={`vis-${transcriptId}`}
                    checked={visibility === "private"}
                    onChange={() => setVisibility("private")}
                  />
                  <Lock size={13} /> Only me
                </label>
                <label className={visibility === "group" ? "on" : ""}>
                  <input
                    type="radio"
                    name={`vis-${transcriptId}`}
                    checked={visibility === "group"}
                    onChange={() => setVisibility("group")}
                  />
                  <Globe size={13} /> Share with Group 13
                </label>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() => void saveNote()}
              >
                {saving ? "Saving…" : "Save"}{" "}
                {turn.task.feature === "notes" ? "notes" : "summary"}
              </button>
              {saveMsg && <span className="field-hint">{saveMsg}</span>}
            </div>
          )}
        </div>
      )}
      <SavedNotes transcriptId={transcriptId} userId={userId} reload={reload} />
    </div>
  );
}

const KIND_LABEL: Record<NoteKind, string> = {
  notes: "Notes",
  summary: "Summary",
};

/** Notes and summaries saved for this transcript: your own plus anything others shared. */
function SavedNotes({
  transcriptId,
  userId,
  reload,
}: {
  transcriptId: string;
  userId: string | null;
  reload: number;
}) {
  const [rows, setRows] = useState<SavedNote[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("transcript_notes")
      .select(
        "id,owner,owner_name,kind,content,visibility,created_at,updated_at",
      )
      .eq("transcript_id", transcriptId)
      .order("updated_at", { ascending: false });
    setFailed(Boolean(error));
    setRows((data as SavedNote[] | null) ?? []);
  }, [transcriptId]);

  useEffect(() => {
    void load();
  }, [load, reload]);

  const setVis = async (row: SavedNote, visibility: Visibility) => {
    if (!supabase) return;
    await supabase
      .from("transcript_notes")
      .update({ visibility })
      .eq("id", row.id);
    void load();
  };

  const remove = async (row: SavedNote) => {
    if (!supabase || !window.confirm("Delete these saved notes?")) return;
    await supabase.from("transcript_notes").delete().eq("id", row.id);
    void load();
  };

  if (failed || rows.length === 0) return null;
  const mine = rows.filter((r) => r.owner === userId);
  const shared = rows.filter((r) => r.owner !== userId);

  const renderRow = (row: SavedNote) => {
    const isMine = row.owner === userId;
    return (
      <div className="ta-note" key={row.id}>
        <div className="ta-note-head">
          <button
            type="button"
            className="ta-note-title"
            onClick={() => setOpen(open === row.id ? null : row.id)}
          >
            {KIND_LABEL[row.kind]} by{" "}
            {isMine ? "you" : row.owner_name || "a member"}
          </button>
          <span className="chip">
            {row.visibility === "group" ? "Shared with Group 13" : "Only you"}
          </span>
          <span className="quiet">
            {new Date(row.updated_at).toLocaleDateString()}
          </span>
          {isMine && (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void setVis(
                    row,
                    row.visibility === "group" ? "private" : "group",
                  )
                }
              >
                {row.visibility === "group" ? "Make private" : "Share"}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Delete saved notes"
                onClick={() => void remove(row)}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
        {open === row.id && (
          <div className="ta-note-body">
            <Markdown text={row.content} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ta-saved">
      {shared.length > 0 && (
        <>
          <div className="section-label">Shared by the group</div>
          {shared.map(renderRow)}
        </>
      )}
      {mine.length > 0 && (
        <>
          <div className="section-label">Your saved notes</div>
          {mine.map(renderRow)}
        </>
      )}
    </div>
  );
}
