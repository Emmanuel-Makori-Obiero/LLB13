import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Library, Loader2, Send, Trash2, Upload } from "lucide-react";
import { isSupabaseConfigured } from "./data/repository";
import {
  AI_MODES,
  askAI,
  deleteMaterial,
  listMyMaterials,
  uploadMaterial,
  type AIFeature,
  type AIMode,
  type AIResult,
} from "./lib/ai";
import { Markdown } from "./Markdown";
import "./assistant.css";

type Doc = {
  id: string;
  title: string;
  citation: string | null;
  scope: string;
  created_at: string;
};

export type Task = {
  feature: AIFeature;
  label: string;
  needsDoc?: boolean;
  placeholder: string;
  fallback?: string; // used when the box is left empty
};

const TASKS: Task[] = [
  {
    feature: "chat",
    label: "Ask",
    placeholder: "Ask a law question, e.g. What is the neighbour principle?",
  },
  {
    feature: "explain",
    label: "Explain",
    placeholder: "Name a concept to explain, e.g. vicarious liability",
  },
  {
    feature: "irac",
    label: "IRAC",
    placeholder: "Paste the problem question (the facts and what is asked)",
  },
  {
    feature: "essay_feedback",
    label: "Essay feedback",
    placeholder: "Paste your draft here",
  },
  {
    feature: "moot",
    label: "Moot prep",
    placeholder: "Describe the moot problem and which side you are on",
  },
  {
    feature: "moot_judge",
    label: "AI judge",
    placeholder: "Paste your submission or describe the moot problem",
  },
  {
    feature: "moot_guide",
    label: "Moot guide",
    placeholder: "Ask how a moot works, e.g. how to address the bench",
  },
  {
    feature: "kmun",
    label: "KMUN practice",
    placeholder: "Choose a country, committee, agenda, or speech to practise",
  },
  {
    feature: "kmun_guide",
    label: "KMUN guide",
    placeholder: "Ask how Model United Nations works",
  },
  {
    feature: "summarize",
    label: "Summarise",
    needsDoc: true,
    placeholder: "Optional: what should the summary focus on?",
    fallback: "Summarise the selected document.",
  },
  {
    feature: "case_brief",
    label: "Case brief",
    needsDoc: true,
    placeholder: "Optional: which case in the document?",
    fallback: "Write a case brief from the selected document.",
  },
  {
    feature: "quiz",
    label: "Quiz",
    needsDoc: true,
    placeholder: "Optional: topic or number of questions",
    fallback: "Create 8 multiple-choice questions from the selected document.",
  },
  {
    feature: "flashcards",
    label: "Flashcards",
    needsDoc: true,
    placeholder: "Optional: topic or number of cards",
    fallback: "Create 12 flashcards from the selected document.",
  },
];

export type Turn = {
  id: number;
  task: Task;
  prompt: string;
  result?: AIResult;
  error?: string;
};

const BASIS_LABEL: Record<AIResult["basis"], string> = {
  materials: "From your uploads",
  library: "From the library",
  mixed: "Your sources plus general law",
  general: "General law, not from your materials",
  none: "Nothing relevant found",
};

type QuizQ = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};
type Card = { front: string; back: string };

function asQuiz(data: unknown): QuizQ[] {
  const qs = (data as { questions?: QuizQ[] } | null)?.questions;
  return Array.isArray(qs)
    ? qs.filter(
        (q) => q && typeof q.question === "string" && Array.isArray(q.options),
      )
    : [];
}
function asCards(data: unknown): Card[] {
  const cs = (data as { cards?: Card[] } | null)?.cards;
  return Array.isArray(cs)
    ? cs.filter((c) => c && typeof c.front === "string")
    : [];
}

function Quiz({ questions }: { questions: QuizQ[] }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const done = Object.keys(picked).length;
  const score = questions.filter((q, i) => picked[i] === q.answerIndex).length;
  return (
    <div className="sa-quiz">
      {questions.map((q, qi) => {
        const choice = picked[qi];
        const answered = choice !== undefined;
        return (
          <div className="sa-q" key={qi}>
            <p className="sa-q-text">
              {qi + 1}. {q.question}
            </p>
            <div className="sa-options">
              {q.options.map((o, oi) => {
                const cls = !answered
                  ? ""
                  : oi === q.answerIndex
                    ? "right"
                    : oi === choice
                      ? "wrong"
                      : "";
                return (
                  <button
                    key={oi}
                    type="button"
                    className={`sa-option ${cls}`}
                    disabled={answered}
                    onClick={() => setPicked((p) => ({ ...p, [qi]: oi }))}
                  >
                    <span className="sa-letter">
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {o}
                  </button>
                );
              })}
            </div>
            {answered && q.explanation && (
              <p className="sa-explain">{q.explanation}</p>
            )}
          </div>
        );
      })}
      <p className="sa-score">
        {done < questions.length
          ? `${done} of ${questions.length} answered`
          : `Score: ${score} of ${questions.length}`}
      </p>
    </div>
  );
}

function Flashcards({ cards }: { cards: Card[] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];
  const go = (d: number) => {
    setFlipped(false);
    setI((x) => (x + d + cards.length) % cards.length);
  };
  return (
    <div className="sa-flash">
      <button
        type="button"
        className={`sa-card ${flipped ? "back" : ""}`}
        onClick={() => setFlipped((f) => !f)}
      >
        <span className="sa-card-side">
          {flipped ? "Application" : "Rule or term"}
        </span>
        <span className="sa-card-text">{flipped ? card.back : card.front}</span>
        <span className="sa-card-hint">Tap to flip</span>
      </button>
      <div className="sa-flash-nav">
        <button
          type="button"
          className="secondary-button"
          onClick={() => go(-1)}
        >
          Previous
        </button>
        <span className="quiet">
          {i + 1} of {cards.length}
        </span>
        <button
          type="button"
          className="secondary-button"
          onClick={() => go(1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function Answer({ turn }: { turn: Turn }) {
  const r = turn.result;
  if (turn.error && !r)
    return <div className="connection-error">{turn.error}</div>;
  if (!r) return null;
  const quiz = turn.task.feature === "quiz" ? asQuiz(r.data) : [];
  const cards = turn.task.feature === "flashcards" ? asCards(r.data) : [];
  const structured = quiz.length > 0 || cards.length > 0;
  return (
    <div className="sa-answer">
      {turn.error && <div className="connection-error">{turn.error}</div>}
      <div className="sa-basis">
        <span className={`sa-badge ${r.grounded ? "grounded" : "open"}`}>
          {BASIS_LABEL[r.basis]}
        </span>
        {r.model && <span className="quiet">{r.model}</span>}
      </div>
      {quiz.length > 0 && <Quiz questions={quiz} />}
      {cards.length > 0 && <Flashcards cards={cards} />}
      {!structured && <Markdown text={r.answer} />}
      {r.warnings.length > 0 && (
        <ul className="sa-warnings">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {r.sources.length > 0 && (
        <div className="sa-sources">
          <div className="section-label">Sources used</div>
          {r.sources.map((s) => (
            <div className="sa-source" key={s.tag}>
              <sup className="md-cite">{s.tag}</sup>
              <span>
                {s.title}
                {s.ref ? `, ${s.ref}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StudyAssistant() {
  const [mode, setMode] = useState<AIMode>("auto");
  const [task, setTask] = useState<Task>(TASKS[0]);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setDocs((await listMyMaterials()) as Doc[]);
    } catch {
      setNote("Could not load your documents.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  const toggleDoc = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-10),
    );

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setNote("");
    for (const file of Array.from(files)) {
      try {
        const r = await uploadMaterial(file);
        setNote(`Uploaded ${file.name} (${r.chunks} sections).`);
        setSelected((s) => [...s, r.id].slice(-10));
      } catch (e) {
        setNote((e as Error).message);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
    void refresh();
  };

  const onDelete = async (d: Doc) => {
    if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    await deleteMaterial(d.id);
    setSelected((s) => s.filter((x) => x !== d.id));
    void refresh();
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const text = input.trim() || task.fallback || "";
    if (!text) return;
    if (task.needsDoc && selected.length === 0) {
      setNote("Choose at least one document on the right first.");
      return;
    }
    setNote("");
    const turn: Turn = { id: nextId.current++, task, prompt: text };
    setTurns((t) => [...t, turn]);
    setInput("");
    setBusy(true);

    // Document tasks need the chosen documents, so "Any law" is switched to "Smart" for them.
    const useMode: AIMode = task.needsDoc && mode === "general" ? "auto" : mode;
    const history = task.needsDoc
      ? []
      : turns
          .filter((t) => t.result && !t.task.needsDoc)
          .slice(-3)
          .flatMap((t) => [
            { role: "user" as const, content: t.prompt },
            { role: "assistant" as const, content: t.result!.answer },
          ]);
    try {
      const result = await askAI({
        feature: task.feature,
        mode: useMode,
        messages: [...history, { role: "user", content: text }],
        docIds: selected.length ? selected : undefined,
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

  const modeInfo = AI_MODES.find((m) => m.value === mode);
  const mine = docs.filter((d) => d.scope === "user");
  const shared = docs.filter((d) => d.scope !== "user");

  if (!isSupabaseConfigured)
    return (
      <div className="card card-pad">
        <h2>Study assistant</h2>
        <p className="subheading">Connect Supabase to use the assistant.</p>
      </div>
    );

  return (
    <div className="sa">
      <div className="sa-main card">
        <div className="sa-thread">
          {turns.length === 0 && (
            <div className="sa-empty">
              <h2>What are we studying today?</h2>
              <p className="subheading">
                Pick a task, choose where answers may come from, and ask. For
                summaries, case briefs, quizzes and flashcards, tick a document
                on the right first.
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
                <Answer turn={t} />
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form className="sa-compose" onSubmit={send}>
          <div className="sa-tasks" role="tablist" aria-label="Task">
            {TASKS.map((t) => (
              <button
                key={t.feature}
                type="button"
                role="tab"
                aria-selected={t.feature === task.feature}
                className={`sa-task ${t.feature === task.feature ? "on" : ""}`}
                onClick={() => setTask(t)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="sa-inputrow">
            <textarea
              value={input}
              rows={2}
              placeholder={task.placeholder}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
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

      <aside className="sa-side">
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
                  name="ai-mode"
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <p className="field-hint">{modeInfo?.hint}</p>
        </div>

        <div className="card card-pad">
          <div className="sa-docs-head">
            <div className="section-label">My documents</div>
            <button
              type="button"
              className="secondary-button sa-upload"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 size={13} className="sa-spin" />
              ) : (
                <Upload size={13} />
              )}{" "}
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => void onUpload(e.target.files)}
            />
          </div>
          <p className="field-hint">
            PDF, Word, text or markdown. Scanned PDFs need OCR first.
          </p>
          {mine.length === 0 ? (
            <p className="empty sa-none">No uploads yet.</p>
          ) : (
            <div className="sa-doclist">
              {mine.map((d) => (
                <div className="sa-doc" key={d.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      onChange={() => toggleDoc(d.id)}
                    />
                    <FileText size={14} />
                    <span>{d.title}</span>
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete ${d.title}`}
                    onClick={() => void onDelete(d)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {shared.length > 0 && (
          <div className="card card-pad">
            <div className="section-label">Library books</div>
            <div className="sa-doclist">
              {shared.map((d) => (
                <div className="sa-doc" key={d.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      onChange={() => toggleDoc(d.id)}
                    />
                    <Library size={14} />
                    <span>{d.title}</span>
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
