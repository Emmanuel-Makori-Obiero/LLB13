import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Library, Loader2, Send, Trash2, Upload, CheckCircle2 } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./data/repository";
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
import { materialVisibleToLevel } from "./lib/learnerAdaptation";
import "./assistant.css";

type Doc = {
  id: string;
  title: string;
  author?: string | null;
  citation: string | null;
  scope: string;
  created_at: string;
  target_years?: string[] | null;
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
    feature: "book_contents",
    label: "Book contents",
    needsDoc: true,
    placeholder: "Optional: tell me what kind of contents list you want",
    fallback:
      "Create a table of contents and list every major topic and subtopic in the selected book.",
  },
  {
    feature: "topic_summary",
    label: "Topic summary",
    needsDoc: true,
    placeholder: "Name the chapter, topic, or section to summarise",
    fallback:
      "List the main topics in the selected book and ask me which one I want to study first.",
  },
  {
    feature: "book_recommendation",
    label: "Find a library book",
    placeholder:
      "What are you revising? e.g. judicial review or contract remedies",
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
    fallback: "Create 8 open-response exam questions from the selected document. I will write each answer myself.",
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
  mode?: AIMode;
  docIds?: string[];
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
  modelAnswer: string;
  keyPoints: string[];
  explanation: string;
};
type Card = { front: string; back: string };
type ContentsItem = { title: string; topics?: string[]; summary?: string };

function asQuiz(data: unknown): QuizQ[] {
  const qs = (data as { questions?: unknown[] } | null)?.questions;
  if (!Array.isArray(qs)) return [];
  return qs.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (typeof item.question !== "string") return [];
    const options = Array.isArray(item.options) ? item.options.map(String) : [];
    const answerIndex = Number(item.answerIndex);
    const modelAnswer = String(item.modelAnswer ?? item.model_answer ?? item.answer ?? (Number.isInteger(answerIndex) ? options[answerIndex] : "") ?? "");
    return [{ question: item.question, modelAnswer, keyPoints: Array.isArray(item.keyPoints) ? item.keyPoints.map(String) : [], explanation: String(item.explanation ?? "") }];
  });
}
function asCards(data: unknown): Card[] {
  const cs = (data as { cards?: Card[] } | null)?.cards;
  return Array.isArray(cs)
    ? cs.filter((c) => c && typeof c.front === "string")
    : [];
}
function asContents(data: unknown): ContentsItem[] {
  const items = (data as { contents?: ContentsItem[] } | null)?.contents;
  return Array.isArray(items)
    ? items.filter((item) => item && typeof item.title === "string")
    : [];
}
function Contents({ items }: { items: ContentsItem[] }) {
  return (
    <div className="sa-contents">
      <div className="section-label">Table of contents and topics</div>
      <ol>
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`}>
            <strong>{item.title}</strong>
            {item.summary && <p>{item.summary}</p>}
            {!!item.topics?.length && (
              <ul>
                {item.topics.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Quiz({ questions, mode, docIds }: { questions: QuizQ[]; mode: AIMode; docIds?: string[] }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [reviews, setReviews] = useState<Record<number, string>>({});
  const [checking, setChecking] = useState<number | null>(null);
  const done = Object.keys(reviews).length;
  const check = async (index: number) => {
    const answer = answers[index]?.trim();
    if (!answer || checking !== null) return;
    setChecking(index);
    try {
      const question = questions[index];
      const result = await askAI({
        feature: "chat",
        mode,
        docIds,
        messages: [{ role: "user", content: `Assess this student's written revision answer fairly. Identify accurate reasoning, omissions or errors and why they matter. Give one concrete improvement. Treat a proposed answer as a guide, not the only acceptable view; accept defensible alternatives and do not invent authorities.

Question: ${question.question}
Suggested answer: ${question.modelAnswer}
Key points: ${question.keyPoints.join("; ")}
Explanation: ${question.explanation}
Student answer: ${answer}` }],
      });
      setReviews((current) => ({ ...current, [index]: result.answer }));
    } catch (error) {
      setReviews((current) => ({ ...current, [index]: error instanceof Error ? error.message : "Could not review this answer." }));
    } finally {
      setChecking(null);
    }
  };
  return (
    <div className="sa-quiz">
      <p className="field-hint">Write an answer in your own words, then check it for feedback. There are no answer choices.</p>
      {questions.map((question, index) => (
        <div className="sa-q" key={index}>
          <p className="sa-q-text">{index + 1}. {question.question}</p>
          <textarea rows={5} value={answers[index] ?? ""} disabled={!!reviews[index] || checking !== null} onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))} placeholder="Write your answer in your own words…" />
          <button type="button" className="primary-button" disabled={!answers[index]?.trim() || checking !== null || !!reviews[index]} onClick={() => void check(index)}>{checking === index ? <><Loader2 size={14} /> Reviewing…</> : reviews[index] ? <><CheckCircle2 size={14} /> Answer reviewed</> : "Check my written answer"}</button>
          {reviews[index] && <div className="sa-explain"><Markdown text={reviews[index]} />{question.modelAnswer && <details><summary>Suggested answer</summary><Markdown text={question.modelAnswer} />{question.explanation && <Markdown text={question.explanation} />}</details>}</div>}
        </div>
      ))}
      <p className="sa-score">{done} of {questions.length} answers reviewed</p>
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
  const contents =
    turn.task.feature === "book_contents" ? asContents(r.data) : [];
  const structured = quiz.length > 0 || cards.length > 0 || contents.length > 0;
  return (
    <div className="sa-answer">
      {turn.error && <div className="connection-error">{turn.error}</div>}
      <div className="sa-basis">
        <span className={`sa-badge ${r.grounded ? "grounded" : "open"}`}>
          {BASIS_LABEL[r.basis]}
        </span>
        {r.model && <span className="quiet">{r.model}</span>}
      </div>
      {quiz.length > 0 && <Quiz questions={quiz} mode={turn.mode ?? "auto"} docIds={turn.docIds} />}
      {cards.length > 0 && <Flashcards cards={cards} />}
      {contents.length > 0 && <Contents items={contents} />}
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
              {s.ref && /^https?:\/\//i.test(s.ref) ? (
                <a href={s.ref} target="_blank" rel="noreferrer">
                  {s.title} ↗
                </a>
              ) : (
                <span>
                  {s.title}
                  {s.author ? ` — ${s.author}` : ""}
                  {s.ref ? `, ${s.ref}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StudyAssistant({ learnerLevel = "" }: { learnerLevel?: string }) {
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
  const imageRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const [historyOwner, setHistoryOwner] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const docs = (await listMyMaterials()) as Doc[];
      setDocs(docs.filter((doc) => doc.scope !== "library" || materialVisibleToLevel(doc.target_years, learnerLevel)));
    } catch {
      setNote("Could not load your documents.");
    }
  }, [learnerLevel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let active = true;
    if (!supabase) { setHistoryLoaded(true); return; }
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setHistoryOwner(data.user?.id ?? "");
      setHistoryLoaded(true);
    }).catch(() => { if (active) setHistoryLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!historyLoaded || !historyOwner) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(`g13.study-assistant.history.${historyOwner}`) ?? "[]") as Turn[];
      const restored = Array.isArray(saved) ? saved.filter((turn) => turn && typeof turn.id === "number" && turn.task && typeof turn.prompt === "string" && (turn.result || turn.error)).slice(-80) : [];
      setTurns(restored);
      nextId.current = restored.reduce((maximum, turn) => Math.max(maximum, turn.id), 0) + 1;
    } catch { /* Ignore unavailable or malformed local history. */ }
  }, [historyLoaded, historyOwner]);

  useEffect(() => {
    if (!historyLoaded || !historyOwner) return;
    try {
      window.localStorage.setItem(`g13.study-assistant.history.${historyOwner}`, JSON.stringify(turns.filter((turn) => turn.result || turn.error).slice(-80)));
    } catch { /* Local history is a convenience; the assistant remains usable if storage is full. */ }
  }, [historyLoaded, historyOwner, turns]);

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
    if (imageRef.current) imageRef.current.value = "";
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

    // Document tasks need the chosen documents, so "Any law" is switched to "Smart" for them.
    const useMode: AIMode =
      task.feature === "book_recommendation"
        ? "library"
        : task.needsDoc && mode === "general"
          ? "auto"
          : mode;
    turn.mode = useMode;
    turn.docIds = selected.length ? [...selected] : undefined;
    setTurns((t) => [...t, turn]);
    setInput("");
    setBusy(true);
    const history = task.needsDoc
      ? []
      : turns
          .filter((t) => t.result && !t.task.needsDoc)
          .slice(-8)
          .flatMap((t) => [
            { role: "user" as const, content: t.prompt.slice(0, 1200) },
            { role: "assistant" as const, content: t.result!.answer.slice(0, 3000) },
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
              <p className="field-hint">Your study-assistant conversation is saved in this browser for your signed-in account, so it remains available when you return to this page. It is not visible to other students or the admin.</p>
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
                Clear conversation history
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
            <div className="sa-upload-actions">
              <button
                type="button"
                className="secondary-button sa-upload"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 size={13} className="sa-spin" /> : <Upload size={13} />} Upload document
              </button>
              <button
                type="button"
                className="secondary-button sa-upload"
                disabled={uploading}
                onClick={() => imageRef.current?.click()}
              >
                <ImageIcon size={13} /> Upload images
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.rtf,.csv,.json,.html,application/*,text/*"
              onChange={(e) => void onUpload(e.target.files)}
            />
            <input
              ref={imageRef}
              type="file"
              hidden
              multiple
              accept="image/*"
              onChange={(e) => void onUpload(e.target.files)}
            />
          </div>
          <p className="field-hint">
            PDF, Word, text, markdown, or scanned images. OCR runs automatically.
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
