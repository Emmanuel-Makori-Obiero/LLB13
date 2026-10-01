import { useRef, useState } from "react";
import {
  Download,
  Layers,
  ListChecks,
  Loader2,
  NotebookPen,
  NotebookText,
} from "lucide-react";
import {
  askAI,
  saveTextMaterial,
  type AIFeature,
  type AIResult,
} from "./lib/ai";
import { Answer, type Turn } from "./StudyAssistant";
import "./assistant.css";

const SECTIONS_PER_PART = 10; // must match CHUNKS_PART in the ai function

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
];

export function TranscriptAI({
  title,
  getText,
  ready,
}: {
  title: string;
  getText: () => string;
  ready: boolean; // false while the transcript text is still loading
}) {
  const [busy, setBusy] = useState<AIFeature | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [step, setStep] = useState("");
  const [notesText, setNotesText] = useState("");
  const saved = useRef<{ id: string; chunks: number } | null>(null);

  const mkTask = (a: Action) => ({
    feature: a.feature,
    label: a.label,
    placeholder: "",
  });

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([`# ${title}\n\n${notesText}`], { type: "text/markdown" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "lecture"} - notes.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
            last = await askAI({
              feature: "notes",
              mode: "materials",
              messages: [{ role: "user", content: action.prompt }],
              docIds: [doc.id],
              part: i,
            });
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
          <Answer turn={turn} />
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
              {turn.task.feature === "notes" && (
                <button
                  type="button"
                  className="secondary-button ta-btn"
                  onClick={download}
                >
                  <Download size={13} /> Download .md
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
