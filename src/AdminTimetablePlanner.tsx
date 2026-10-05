import { useEffect, useMemo, useState } from "react";
import { Check, FileUp, Lightbulb, RefreshCw, X } from "lucide-react";
import { askAI, extractText } from "./lib/ai";
import { repository } from "./data/repository";
import type { Lesson, TimetableProposal, Unit } from "./data/types";

type Props = {
  lessons: Lesson[];
  units: Unit[];
  onApplied: (lessons: Lesson[]) => void;
  setNotice: (notice: string) => void;
};

type DraftLesson = Omit<Lesson, "id" | "created_by">;

const emptyLesson = (row: Record<string, string>): DraftLesson => ({
  unit: row.unit ?? row.course ?? row.subject ?? "",
  topic: row.topic ?? row.lesson ?? row.title ?? "",
  lesson_date: row.lesson_date ?? row.date ?? "",
  start_time: row.start_time ?? row.start ?? "",
  end_time: row.end_time ?? row.end ?? "",
  representative: row.representative ?? row.rep ?? "",
  representatives: row.representatives
    ? row.representatives
        .split(";")
        .map((v) => v.trim())
        .filter(Boolean)
    : [],
  venue: row.venue ?? row.room ?? "",
});

function parseCsv(text: string): DraftLesson[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"' && quoted) {
      cell += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2)
    throw new Error(
      "The timetable file needs a header row and at least one lesson row.",
    );
  const headers = rows[0].map((h) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
  );
  return rows
    .slice(1)
    .map((values) =>
      emptyLesson(
        Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])),
      ),
    )
    .filter((lesson) => lesson.unit && lesson.topic && lesson.lesson_date);
}

function parseDocumentRows(text: string): DraftLesson[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const datePattern = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/;
  const timePattern =
    /(\d{1,2}:\d{2}\s*(?:am|pm)?)(?:\s*(?:-|to|–)\s*(\d{1,2}:\d{2}\s*(?:am|pm)?))?/i;
  return lines.flatMap((line) => {
    const dateMatch = line.match(datePattern);
    const times = line.match(timePattern);
    if (!dateMatch || !times) return [];
    const date = dateMatch[1];
    const normalizedDate = /^\d{4}-/.test(date)
      ? date
      : (() => {
          const [day, month, year] = date.split(/[/-]/);
          return `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        })();
    const beforeDate = line.slice(0, dateMatch.index).trim();
    const columns = beforeDate
      .split(/\s{2,}|\||,/)
      .map((value) => value.trim())
      .filter(Boolean);
    return [
      {
        unit: columns[0] ?? "",
        topic: columns.slice(1).join(" ") || beforeDate,
        lesson_date: normalizedDate,
        start_time: times[1]?.trim() ?? "",
        end_time: times[2]?.trim() ?? "",
        representative: "",
        representatives: [],
        venue: line
          .slice((times.index ?? 0) + times[0].length)
          .replace(/^\s*[|,-]\s*/, "")
          .trim(),
      },
    ];
  });
}

function cleanLessons(input: unknown, units: Unit[] | string[]): DraftLesson[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set(
    units.map((u) => (typeof u === "string" ? u : u.name)),
  );
  return input
    .map((item) => {
      const value = item as Record<string, unknown>;
      const unit = String(value.unit ?? "").trim();
      const reps = Array.isArray(value.representatives)
        ? value.representatives.map(String)
        : [];
      return {
        unit: allowed.has(unit) ? unit : "",
        topic: String(value.topic ?? "").trim(),
        lesson_date: String(value.lesson_date ?? "").slice(0, 10),
        start_time: String(value.start_time ?? "").slice(0, 5),
        end_time: String(value.end_time ?? "").slice(0, 5),
        representative: String(value.representative ?? reps[0] ?? "").trim(),
        representatives: reps,
        venue: String(value.venue ?? "").trim(),
      };
    })
    .filter(
      (lesson) =>
        lesson.unit &&
        lesson.topic &&
        /^\d{4}-\d{2}-\d{2}$/.test(lesson.lesson_date),
    );
}

const displayDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function AdminTimetablePlanner({
  lessons,
  units,
  onApplied,
  setNotice,
}: Props) {
  const [instruction, setInstruction] = useState("");
  const [classTimetable, setClassTimetable] = useState<DraftLesson[] | null>(
    null,
  );
  const [classSourceText, setClassSourceText] = useState("");
  const [proposals, setProposals] = useState<TimetableProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const pending = useMemo(
    () => proposals.filter((proposal) => proposal.status === "pending"),
    [proposals],
  );
  const latestApproved = useMemo(
    () => proposals.find((proposal) => proposal.status === "approved"),
    [proposals],
  );
  const load = async () => {
    try {
      setProposals(await repository.getTimetableProposals());
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not load timetable proposals. Run timetable-proposals.sql first.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const createProposal = async (
    title: string,
    proposed: DraftLesson[],
    rationale: string,
  ) => {
    const valid = proposed.filter(
      (lesson) => lesson.unit && lesson.topic && lesson.lesson_date,
    );
    if (!valid.length)
      throw new Error(
        "No valid lessons were found. Use unit, topic and lesson_date columns.",
      );
    const created = await repository.createTimetableProposal({
      title,
      instruction: instruction.trim(),
      source_filename: null,
      proposed_lessons: valid,
      rationale,
    });
    setProposals((current) => [created, ...current]);
    setInstruction("");
    setNotice(
      "Timetable proposal saved. Review the reasons, then press Approve to apply it.",
    );
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const lowerName = file.name.toLowerCase();
      const text =
        lowerName.endsWith(".csv") || lowerName.endsWith(".txt")
          ? await file.text()
          : await extractText(file);
      const parsed = lowerName.endsWith(".csv")
        ? parseCsv(text)
        : parseDocumentRows(text);
      setClassTimetable(parsed);
      setClassSourceText(text);
      setNotice(
        `Official class timetable loaded: ${parsed.length} structured rows${parsed.length ? "" : " (the AI will read the extracted document text directly)"}. Now describe how to turn it into the Group 13 timetable.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not read that timetable file.",
      );
    } finally {
      setBusy(false);
    }
  };

  const propose = async () => {
    if (!instruction.trim()) {
      setNotice(
        "Describe the change you want the timetable planner to consider.",
      );
      return;
    }
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await askAI({
        feature: "timetable_proposal",
        mode: "general",
        messages: [
          {
            role: "user",
            content: `Today is ${today}. Available units: ${JSON.stringify(units.map((unit) => unit.name))}\n\nOFFICIAL CLASS TIMETABLE (source; extracted from PDF, Word or CSV):\n${classSourceText}\n\nBEST-EFFORT STRUCTURED ROWS:\n${JSON.stringify(classTimetable)}\n\nCURRENT GROUP 13 TIMETABLE (context only):\n${JSON.stringify(lessons)}\n\nADMIN INSTRUCTION FOR THE GROUP TIMETABLE:\n${instruction.trim()}`,
          },
        ],
      });
      const data = (response.data ?? {}) as {
        title?: string;
        rationale?: string;
        lessons?: unknown;
      };
      const sourceUnits = (classTimetable ?? []).map((lesson) => lesson.unit);
      const proposed = cleanLessons(data.lessons, [
        ...units.map((unit) => unit.name),
        ...sourceUnits,
      ]);
      if (!proposed.length)
        throw new Error(
          response.answer ||
            "The AI did not return a usable timetable. Try a more specific instruction.",
        );
      await createProposal(
        data.title?.trim() || "Group 13 timetable proposal",
        proposed,
        data.rationale?.trim() ||
          "The planner generated this Group 13 schedule from the official class timetable and the admin instruction.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not create a timetable proposal.",
      );
    } finally {
      setBusy(false);
    }
  };

  const approve = async (proposal: TimetableProposal) => {
    if (
      !window.confirm(
        `Approve “${proposal.title}” and replace the current timetable with its ${proposal.proposed_lessons.length} lessons?`,
      )
    )
      return;
    setBusy(true);
    try {
      const count = await repository.approveTimetableProposal(proposal.id);
      const fresh = await repository.getTimetable();
      onApplied(fresh);
      setProposals((current) =>
        current.map((item) =>
          item.id === proposal.id
            ? {
                ...item,
                status: "approved",
                approved_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      setNotice(
        `Approved. ${count} lessons now apply to the current timetable.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not approve timetable proposal.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reject = async (proposal: TimetableProposal) => {
    setBusy(true);
    try {
      await repository.rejectTimetableProposal(proposal.id);
      setProposals((current) =>
        current.map((item) =>
          item.id === proposal.id ? { ...item, status: "rejected" } : item,
        ),
      );
      setNotice("Proposal rejected. The current timetable was not changed.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not reject proposal.",
      );
    } finally {
      setBusy(false);
    }
  };

  const removeProposal = async (proposal: TimetableProposal) => {
    if (!window.confirm(`Delete “${proposal.title}” from timetable history? This does not change the current timetable.`)) return;
    setBusy(true);
    try {
      await repository.deleteTimetableProposal(proposal.id);
      setProposals((current) => current.filter((item) => item.id !== proposal.id));
      setNotice("Timetable proposal removed from history.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete timetable proposal.");
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (proposal: TimetableProposal) => {
    if (
      !window.confirm(
        `Roll back “${proposal.title}” and restore the timetable from immediately before that approval?`,
      )
    )
      return;
    setBusy(true);
    try {
      const count = await repository.rollbackTimetableProposal(proposal.id);
      const fresh = await repository.getTimetable();
      onApplied(fresh);
      setProposals((current) =>
        current.map((item) =>
          item.id === proposal.id ? { ...item, status: "reverted" } : item,
        ),
      );
      setNotice(`Rollback complete. ${count} previous lessons were restored.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not roll back the timetable.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad admin-timetable-planner">
      <div className="card-header">
        <div>
          <span className="section-label">
            Class timetable → Group 13 timetable · admin only
          </span>
          <p className="field-hint">
            Load the official class timetable as the source, describe the
            group’s needs, then review and approve the generated Group 13
            timetable.
          </p>
        </div>
        <span className="chip">{pending.length} pending</span>
      </div>
      <div className="admin-planner-grid">
        <div>
          <label className="upload-drop">
            <FileUp size={18} />
            <span>
              <strong>Upload official class timetable</strong>
              <small>
                PDF, Word (.docx), CSV or text. PDF/Word tables are read in the
                browser.
              </small>
            </span>
            <input
              type="file"
              accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.csv,text/csv,.txt"
              onChange={(event) => void onFile(event.target.files?.[0])}
              disabled={busy}
            />
          </label>
          <p className="field-hint">
            This only loads the official class timetable into the planner. It
            does not alter the current Group 13 timetable.
          </p>
        </div>
        <div>
          <label className="field-label">
            Describe the Group 13 timetable needs
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Example: There may be strikes from tomorrow. Use online alternatives where possible, keep essential class lessons, and schedule catch-up sessions next week. Groupmates prefer physical meetups on Friday from 2–5 pm."
              rows={6}
              disabled={busy}
            />
          </label>
          <button
            className="primary-button"
            onClick={() => void propose()}
            disabled={busy || !classSourceText}
          >
            <Lightbulb size={14} />{" "}
            {busy ? "Working…" : "Make Group 13 proposal"}
          </button>
        </div>
      </div>
      {classSourceText ? (
        <p className="field-hint">
          Official class timetable ready: {classTimetable?.length ?? 0}{" "}
          structured rows plus extracted document text will be used as the
          source.
        </p>
      ) : (
        <p className="field-hint">
          Upload the official class timetable first. The proposal button will
          activate after it is loaded.
        </p>
      )}
      {loading ? (
        <p className="field-hint">Loading proposal history…</p>
      ) : proposals.length === 0 ? (
        <p className="empty">No proposals yet.</p>
      ) : (
        <div className="proposal-list">
          {proposals.map((proposal) => (
            <div
              className={`proposal-card ${proposal.status}`}
              key={proposal.id}
            >
              <div className="card-header">
                <div>
                  <div className="row-title">{proposal.title}</div>
                  <div className="row-meta">
                    {proposal.status} · {proposal.proposed_lessons.length}{" "}
                    lessons · {displayDate(proposal.created_at.slice(0, 10))}
                    {proposal.source_filename
                      ? ` · ${proposal.source_filename}`
                      : ""}
                  </div>
                </div>
                <span className="chip">{proposal.status}</span>
              </div>
              {proposal.instruction && (
                <p>
                  <strong>Request:</strong> {proposal.instruction}
                </p>
              )}
              <p>
                <strong>Why:</strong> {proposal.rationale}
              </p>
              <details>
                <summary>Preview proposed lessons</summary>
                <div className="proposal-preview">
                  {proposal.proposed_lessons
                    .slice(0, 20)
                    .map((lesson, index) => (
                      <div className="row" key={`${proposal.id}-${index}`}>
                        <span className="tt-time">
                          {lesson.start_time || "—"}
                        </span>
                        <span className="row-main">
                          <strong>{lesson.topic}</strong>
                          <small>
                            {lesson.unit} · {displayDate(lesson.lesson_date)}
                            {lesson.venue ? ` · ${lesson.venue}` : ""}
                          </small>
                        </span>
                      </div>
                    ))}
                  {proposal.proposed_lessons.length > 20 && (
                    <small>Showing first 20 lessons.</small>
                  )}
                </div>
              </details>
              {proposal.status === "pending" && (
                <div className="tt-actions">
                  <button
                    className="secondary-button"
                    onClick={() => void reject(proposal)}
                    disabled={busy}
                  >
                    <X size={14} /> Reject
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => void approve(proposal)}
                    disabled={busy}
                  >
                    <Check size={14} /> Approve and apply
                  </button>
                </div>
              )}
              {proposal.status === "approved" &&
                latestApproved?.id === proposal.id && (
                  <div className="tt-actions">
                    <button
                      className="secondary-button"
                      onClick={() => void rollback(proposal)}
                      disabled={busy}
                    >
                      Roll back to previous timetable
                    </button>
                  </div>
                )}
              <div className="tt-actions">
                <button
                  className="secondary-button"
                  onClick={() => void removeProposal(proposal)}
                  disabled={busy}
                >
                  <X size={14} /> Delete from history
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="field-hint">
        <RefreshCw size={12} /> Approval replaces the shared timetable
        atomically. Existing lessons are not changed by generating or rejecting
        a proposal.
      </div>
    </div>
  );
}
