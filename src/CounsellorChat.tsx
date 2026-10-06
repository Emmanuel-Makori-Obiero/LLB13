import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { askAI, type AIMessage } from "./lib/ai";
import { Markdown } from "./Markdown";
import StorytellButton from "./StorytellButton";
import "./assistant.css";

type Bubble = AIMessage & { failed?: boolean };

const OPENING =
  "Hi. This is a quiet place to talk through whatever is weighing on you, whether it's workload, exams, a moot, or just a heavy day. What's on your mind?";

export function CounsellorChat() {
  const [turns, setTurns] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Bubble[] = [
      ...turns.filter((t) => !t.failed),
      { role: "user", content: text },
    ];
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      // Only the conversation so far is sent. Nothing is stored by Group 13 Hub.
      const r = await askAI({
        feature: "counsellor",
        mode: "general",
        messages: next.map(({ role, content }) => ({ role, content })),
      });
      setTurns([...next, { role: "assistant", content: r.answer }]);
    } catch (e) {
      setTurns([
        ...next,
        { role: "assistant", content: (e as Error).message, failed: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc">
      <div className="cc-log" aria-live="polite">
        <div className="cc-msg cc-bot">
          <Markdown text={OPENING} />
        </div>
        {turns.map((t, i) => (
          <div
            key={i}
            className={`cc-msg ${t.role === "user" ? "cc-me" : "cc-bot"}`}
          >
            {t.failed ? (
              <div className="connection-error">{t.content}</div>
            ) : t.role === "user" ? (
              <p>{t.content}</p>
            ) : (
              <><Markdown text={t.content} /><StorytellButton title="Assistant explanation" source={t.content} /></>
            )}
          </div>
        ))}
        {busy && (
          <div className="cc-msg cc-bot">
            <Loader2 size={14} className="sa-spin" />
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="cc-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          rows={2}
          maxLength={4000}
          placeholder="Write what's on your mind…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="primary-button"
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
        >
          <Send size={14} />
        </button>
      </form>
      <p className="field-hint">
        Replies come from an AI, not a person or a licensed counsellor. Group
        13 Hub does not save this conversation, and it disappears when you
        leave this page.
      </p>
    </div>
  );
}
