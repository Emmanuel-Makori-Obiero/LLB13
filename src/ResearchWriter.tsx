import { useEffect, useRef, useState } from "react";
import { FileText, Library, Loader2, Send, Trash2, Upload } from "lucide-react";
import { isSupabaseConfigured } from "./data/repository";
import { AI_MODES, askAI, type AIFeature, type AIMode } from "./lib/ai";
import { Answer, type Turn } from "./StudyAssistant";
import { useDocuments } from "./useDocuments";
import "./assistant.css";
import { downloadPdf, downloadWord } from "./export";

type Project = {
  title: string;
  topic: string;
  kind: string;
  style: string;
  words: string;
};
const EMPTY: Project = {
  title: "",
  topic: "",
  kind: "Research paper",
  style: "OSCOLA",
  words: "5000",
};
const KINDS = [
  "Research paper",
  "Essay",
  "Dissertation chapter",
  "Case comment",
  "Legal memorandum",
  "Moot memorial",
  "Law reform proposal",
];
const STYLES = ["OSCOLA", "Bluebook", "APA", "Harvard"];
const STORE = "g13-research-writer";

type Tool = {
  feature: AIFeature;
  label: string;
  placeholder: string;
  needsInput?: boolean; // the text box must be filled
  useDraft?: boolean; // send the current draft as context
  request: (input: string) => string;
};

const TOOLS: Tool[] = [
  {
    feature: "rw_question",
    label: "Research question",
    placeholder: "Optional: your angle, interests or what you already know",
    request: (i) => `Help me find a strong research question. ${i}`.trim(),
  },
  {
    feature: "rw_outline",
    label: "Outline",
    placeholder: "Optional: the thesis or research question you have chosen",
    useDraft: true,
    request: (i) => `Build a detailed outline for my paper. ${i}`.trim(),
  },
  {
    feature: "rw_draft",
    label: "Draft a section",
    placeholder:
      "Which section, and what must it argue? e.g. Literature review: show the gap on data protection",
    needsInput: true,
    useDraft: true,
    request: (i) => `Draft this section: ${i}`,
  },
  {
    feature: "rw_draft",
    label: "Complete paper",
    placeholder: "Optional: your main argument, jurisdiction, or emphasis",
    useDraft: true,
    request: (i) => `Prepare a complete paper draft. ${i}`.trim(),
  },
  {
    feature: "rw_improve",
    label: "Improve text",
    placeholder:
      "Paste the passage to improve. Leave empty to improve the whole draft.",
    useDraft: true,
    request: (i) =>
      i ? `Improve this passage:\n\n${i}` : "Improve the whole draft.",
  },
  {
    feature: "rw_critique",
    label: "Critique my draft",
    placeholder: "Optional: what worries you most about the draft?",
    useDraft: true,
    request: (i) => `Critique my draft like a supervisor. ${i}`.trim(),
  },
  {
    feature: "rw_bookends",
    label: "Intro, abstract, conclusion",
    placeholder: "Which one do you want? e.g. Introduction",
    needsInput: true,
    useDraft: true,
    request: (i) => `Write the ${i}.`,
  },
  {
    feature: "rw_citations",
    label: "Citations",
    placeholder:
      "Paste the cases, statutes, books and articles you want formatted, one per line",
    needsInput: true,
    request: (i) => `Format these authorities:\n\n${i}`,
  },
  {
    feature: "rw_validate",
    label: "Verify draft & citations",
    placeholder: "Checks spelling, coherence, authority support and citation style against your selected sources.",
    useDraft: true,
    request: () => "Audit my complete draft and its citations. Return the requested validation JSON and do not rewrite the draft.",
  },
];

const clip = (text: string, max = 12000) =>
  text.length <= max
    ? text
    : `${text.slice(0, max / 2)}\n[... middle of draft omitted ...]\n${text.slice(-max / 2)}`;
const count = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

type StoredWriterState = { project?: Project; draft?: string; outputMode?: "write" | "teach"; turns?: Turn[] };
function readWriterState(key: string): StoredWriterState {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}") as StoredWriterState;
    const turns = Array.isArray(saved.turns)
      ? saved.turns.slice(-40).map((turn) => turn.result || turn.error ? turn : { ...turn, error: "This request was interrupted before its answer was saved. Send it again if you still need it." })
      : [];
    return { ...saved, turns };
  } catch {
    return {};
  }
}

export function ResearchWriter({ userId }: { userId: string | null }) {
  const storageKey = `${STORE}.${userId ?? "anonymous"}`;
  const [initial] = useState(() => readWriterState(storageKey));
  const [project, setProject] = useState<Project>(() => ({ ...EMPTY, ...initial.project }));
  const [draft, setDraft] = useState(() => initial.draft ?? "");
  const [mode, setMode] = useState<AIMode>("auto");
  const [outputMode, setOutputMode] = useState<"write" | "teach">(() => initial.outputMode === "teach" ? "teach" : "write");
  const [tool, setTool] = useState<Tool>(TOOLS[0]);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>(() => initial.turns ?? []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const nextId = useRef(Math.max(0, ...(initial.turns ?? []).map((turn) => turn.id)) + 1);
  const endRef = useRef<HTMLDivElement>(null);
  const d = useDocuments();

  // Keep this account's project, draft and recent transcript in this browser only.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ project, draft, outputMode, turns: turns.slice(-40) }));
    } catch {
      /* Storage is optional; keep the writer usable if browser storage is unavailable. */
    }
  }, [storageKey, project, draft, outputMode, turns]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  const set =
    (k: keyof Project) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setProject((p) => ({ ...p, [k]: e.target.value }));

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const text = input.trim();
    if (tool.needsInput && !text) {
      setNote("Fill in the box first: " + tool.placeholder);
      return;
    }
    if (tool.feature === "rw_critique" && !draft.trim()) {
      setNote("Write or paste some of your draft first.");
      return;
    }
    if (tool.feature === "rw_validate" && !draft.trim()) {
      setNote("Write or paste your draft first so it can be verified.");
      return;
    }
    if (tool.label === "Complete paper" && outputMode === "write" && !d.selected.length) {
      setNote("Select at least one readable research source before drafting a full legal paper. The writer will not invent authorities.");
      return;
    }
    if (
      !project.topic.trim() &&
      !project.title.trim() &&
      tool.feature !== "rw_citations"
    ) {
      setNote("Add your paper title or topic in Project details first.");
      return;
    }
    setNote("");

    const usesDraft =
      tool.useDraft && draft.trim() && !(tool.feature === "rw_improve" && text);
    const accuracyInstruction = outputMode === "write"
      ? `OUTPUT MODE: Write the requested work fully in ${project.style}. For Complete paper, write a coherent full ${project.kind} near ${project.words || "the requested"} words, with a clear thesis, ordered headings, analysis and conclusion. For Citations, format only the authorities supplied in the input or selected source documents. Use no case, statute, quotation, pinpoint, date or bibliographic detail from memory. Use only facts visible in the selected source documents; where a citation detail or legal proposition is missing, mark [VERIFY SOURCE / PINPOINT] and explain what is missing. Never claim independent verification.`
      : `OUTPUT MODE: Do not write the final paper or simply format the answer. Teach me step by step how to produce the requested ${tool.label.toLowerCase()} in ${project.style}: explain the structure, order of steps, citation placement and bibliography/footnote rules relevant to this task, common errors, and a short checklist. Use generic placeholders such as [Case Name] unless the exact authority is present in my selected sources. Distinguish style rules you can state confidently from details that must be checked against the official style guide.`;
    const requestedWork = outputMode === "teach" && tool.label === "Complete paper"
      ? `Teach me step by step how to prepare a complete ${project.kind} in ${project.style}. ${text}`.trim()
      : tool.request(text);
    const message = [
      requestedWork,
      accuracyInstruction,
      `Topic: ${project.topic || project.title}`,
      project.title && `Paper title: ${project.title}`,
      `Paper type: ${project.kind}. Citation style: ${project.style}. Target length: ${project.words || "not set"} words.`,
      usesDraft ? `Draft so far:\n"""\n${clip(draft)}\n"""` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const priorMessages = turns.slice(-6).flatMap((prior) => [
      { role: "user" as const, content: `${prior.task.label}: ${prior.prompt}` },
      ...(prior.result ? [{ role: "assistant" as const, content: clip(prior.result.answer, 5000) }] : []),
    ]);

    const turn: Turn = {
      id: nextId.current++,
      task: { feature: tool.feature, label: tool.label, placeholder: "" },
      prompt: text || tool.label,
    };
    setTurns((t) => [...t, turn].slice(-40));
    setInput("");
    setBusy(true);
    try {
      const result = await askAI({
        feature: tool.feature,
        mode,
        messages: [...priorMessages, { role: "user", content: message }],
        docIds: d.selected.length ? d.selected : undefined,
      });
      setTurns((all) =>
        all.map((t) => (t.id === turn.id ? { ...t, result } : t)),
      );
    } catch (e) {
      setTurns((all) =>
        all.map((t) =>
          t.id === turn.id ? { ...t, error: (e as Error).message } : t,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const addToDraft = (answer: string) => {
    const clean = answer
      .replace(/^\s*Not drawn from your materials\.?\s*/i, "")
      .trim();
    setDraft((cur) =>
      cur.trim() ? `${cur.trimEnd()}\n\n${clean}\n` : `${clean}\n`,
    );
    setNote("Added to the end of your draft.");
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([`# ${project.title || "Untitled paper"}\n\n${draft}`], {
        type: "text/markdown",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(project.title || "paper").replace(/[^\w\- ]+/g, "").trim() || "paper"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadDraftPdf = () =>
    downloadPdf(
      project.title || "Untitled paper",
      draft,
      `${(project.title || "paper").replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "paper"}.pdf`,
    );
  const downloadDraftWord = () =>
    downloadWord(
      project.title || "Untitled paper",
      draft,
      `${(project.title || "paper").replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "paper"}.docx`,
    );

  if (!isSupabaseConfigured)
    return (
      <div className="card card-pad">
        <h2>Research writer</h2>
        <p className="subheading">
          Connect Supabase to use the research writer.
        </p>
      </div>
    );

  const words = count(draft);
  const target = Number(project.words) || 0;

  return (
    <div className="sa">
      <div className="rw-main">
        <div className="card card-pad rw-draft">
          <div className="sa-docs-head">
            <div className="section-label">Your draft</div>
            <span className="quiet">
              {words.toLocaleString()} words
              {target ? ` of ${target.toLocaleString()}` : ""}
            </span>
          </div>
          {target > 0 && (
            <div className="progress" style={{ margin: "8px 0 12px" }}>
              <span
                style={{ width: `${Math.min(100, (words / target) * 100)}%` }}
              />
            </div>
          )}
          <textarea
            className="rw-editor"
            value={draft}
            placeholder="Write or paste your paper here. Use the tools below to plan, draft, critique and add results straight into it."
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="ta-after">
            <button
              type="button"
              className="secondary-button"
              onClick={() => void navigator.clipboard?.writeText(draft)}
            >
              Copy
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={download}
              disabled={!draft.trim()}
            >
              Download .md
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={downloadDraftPdf}
              disabled={!draft.trim()}
            >
              Download PDF
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={downloadDraftWord}
              disabled={!draft.trim()}
            >
              Download Word
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!draft.trim()}
              onClick={() =>
                window.confirm(
                  "Clear the whole draft? This cannot be undone.",
                ) && setDraft("")
              }
            >
              Clear
            </button>
          </div>
        </div>

        <div className="sa-main card rw-assist">
          <div className="sa-thread">
            {turns.length === 0 && (
              <div className="sa-empty">
                <h2>Writing assistant.</h2>
                <p className="subheading">
                  Fill in Project details, then work through the tools in order:
                  research question, outline, draft each section, critique, then
                  citations. Authorities must come from readable selected source
                  text; the assistant will not cite cases from memory. Search
                  Kenya Law for an official judgment, then save its full text as
                  an AI-readable document for case-specific analysis.
                </p>
              </div>
            )}
            {turns.map((t) => (
              <div className="sa-turn" key={t.id}>
                <div className="sa-prompt">
                  <span className="sa-task-tag">{t.task.label}</span>
                  <p>{t.prompt}</p>
                </div>
                {!t.result && !t.error ? (
                  <div className="sa-thinking">
                    <Loader2 size={15} className="sa-spin" /> Working on it
                  </div>
                ) : (
                  <>
                    <Answer turn={t} />
                    {t.result && t.task.feature !== "rw_citations" && (
                      <div className="ta-after">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => addToDraft(t.result!.answer)}
                        >
                          Add to draft
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            void navigator.clipboard?.writeText(
                              t.result!.answer,
                            )
                          }
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form className="sa-compose" onSubmit={send}>
            <div className="sa-tasks" role="tablist" aria-label="Writing tool">
              {TOOLS.map((t) => (
                <button
                  key={t.feature}
                  type="button"
                  role="tab"
                  aria-selected={t.feature === tool.feature}
                  className={`sa-task ${t.feature === tool.feature ? "on" : ""}`}
                  onClick={() => setTool(t)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="sa-inputrow">
              <textarea
                value={input}
                rows={3}
                placeholder={tool.placeholder}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                className="primary-button sa-send"
                type="submit"
                disabled={busy}
              >
                <Send size={14} /> {busy ? "Working" : "Send"}
              </button>
            </div>
            {note && <p className="sa-note">{note}</p>}
            {turns.length > 0 && (
              <button
                type="button"
                className="sa-clear"
                onClick={() => setTurns([])}
              >
                Clear conversation
              </button>
            )}
          </form>
        </div>
      </div>

      <aside className="sa-side">
        <div className="card card-pad">
          <div className="section-label">Project details</div>
          <p className="field-hint">Your draft and last 40 exchanges are saved locally in this browser for this account. The last six completed exchanges are included as context when you continue; use Clear conversation to remove saved AI turns.</p>
          <div className="data-form">
            <label>
              Writing mode
              <select value={outputMode} onChange={(e) => setOutputMode(e.target.value as "write" | "teach")}>
                <option value="write">Write the work fully</option>
                <option value="teach">Teach me step by step</option>
              </select>
              <span className="field-hint">Writing uses your selected style. Legal authorities and pinpoint citations must come from your selected source documents; gaps are marked for verification.</span>
            </label>
            <label>
              Paper title
              <input
                value={project.title}
                onChange={set("title")}
                placeholder="Working title"
              />
            </label>
            <label>
              Topic or research area
              <textarea
                rows={3}
                value={project.topic}
                onChange={set("topic")}
                placeholder="e.g. Data protection and consent in Kenyan mobile lending"
              />
            </label>
            <label>
              Type
              <select value={project.kind} onChange={set("kind")}>
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Citation style
              <select value={project.style} onChange={set("style")}>
                {STYLES.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Target words
              <input
                inputMode="numeric"
                value={project.words}
                onChange={set("words")}
              />
            </label>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-label">Answer from</div>
          <div className="sa-modes">
            {AI_MODES.map((m) => (
              <label
                key={m.value}
                className={`sa-mode ${mode === m.value ? "on" : ""}`}
              >
                <input
                  type="radio"
                  name="rw-mode"
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <p className="field-hint">
            {AI_MODES.find((m) => m.value === mode)?.hint}
          </p>
        </div>

        <div className="card card-pad">
          <div className="sa-docs-head">
            <div className="section-label">Research sources</div>
            <button
              type="button"
              className="secondary-button sa-upload"
              disabled={d.uploading}
              onClick={() => d.fileRef.current?.click()}
            >
              {d.uploading ? (
                <Loader2 size={13} className="sa-spin" />
              ) : (
                <Upload size={13} />
              )}{" "}
              Upload
            </button>
            <input
              ref={d.fileRef}
              type="file"
              hidden
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.rtf,.csv,.json,.html,application/*,text/*"
              onChange={(e) => void d.upload(e.target.files)}
            />
          </div>
          <p className="field-hint">
            Upload the cases, articles and notes you want used, and tick them.
            Answers will draw on them first.
          </p>
          {d.note && <p className="sa-note">{d.note}</p>}
          {d.mine.length === 0 ? (
            <p className="empty sa-none">No uploads yet.</p>
          ) : (
            <div className="sa-doclist">
              {d.mine.map((doc) => (
                <div className="sa-doc" key={doc.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={d.selected.includes(doc.id)}
                      onChange={() => d.toggle(doc.id)}
                    />
                    <FileText size={14} />
                    <span>{doc.title}</span>
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete ${doc.title}`}
                    onClick={() => void d.remove(doc)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {d.shared.length > 0 && (
          <div className="card card-pad">
            <div className="section-label">Library books</div>
            <div className="sa-doclist">
              {d.shared.map((doc) => (
                <div className="sa-doc" key={doc.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={d.selected.includes(doc.id)}
                      onChange={() => d.toggle(doc.id)}
                    />
                    <Library size={14} />
                    <span>{doc.title}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
