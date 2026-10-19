import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { askAI, type AIMessage } from "./lib/ai";
import { Markdown } from "./Markdown";
import StorytellButton from "./StorytellButton";
import "./assistant.css";

type Bubble = AIMessage & { failed?: boolean };

const OPENING =
  "Hi. This is a quiet place to talk through whatever is weighing on you, whether it's workload, exams, a moot, or just a heavy day. What's on your mind?";

export function CounsellorChat({ storageKey }: { storageKey?: string }) {
  const [turns, setTurns] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storageKey) {
      setTurns([]);
      setReadyKey(null);
      return;
    }
    setReadyKey(null);
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as Bubble[];
      setTurns(Array.isArray(saved) ? saved.slice(-100) : []);
    } catch {
      setTurns([]);
    }
    setReadyKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || readyKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(turns.slice(-100)));
    } catch {
      /* Keep the chat usable if browser storage is disabled or full. */
    }
  }, [storageKey, readyKey, turns]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Bubble[] = [
      ...turns.filter((turn) => !turn.failed),
      { role: "user" as const, content: text },
    ].slice(-100);
    setTurns(next);
    setInput("");
    setBusy(true);
    try {
      // Only this conversation is sent for context; local history is optional and browser-scoped.
      const result = await askAI({
        feature: "counsellor",
        mode: "general",
        messages: next.map(({ role, content }) => ({ role, content })),
      });
      setTurns([...next, { role: "assistant" as const, content: result.answer }].slice(-100));
    } catch (error) {
      setTurns([
        ...next,
        { role: "assistant" as const, content: error instanceof Error ? error.message : "The wellbeing assistant is unavailable.", failed: true },
      ].slice(-100));
    } finally {
      setBusy(false);
    }
  };

  const clearHistory = () => {
    setTurns([]);
    if (storageKey) {
      try { window.localStorage.removeItem(storageKey); } catch { /* Ignore unavailable storage. */ }
    }
  };

  return (
    <div className="cc">
      <div className="cc-log" aria-live="polite">
        <div className="cc-msg cc-bot"><Markdown text={OPENING} /></div>
        {turns.map((turn, index) => (
          <div key={index} className={`cc-msg ${turn.role === "user" ? "cc-me" : "cc-bot"}`}>
            {turn.failed ? <div className="connection-error">{turn.content}</div>
              : turn.role === "user" ? <p>{turn.content}</p>
                : <><Markdown text={turn.content} /><StorytellButton title="Assistant explanation" source={turn.content} /></>}
          </div>
        ))}
        {busy && <div className="cc-msg cc-bot"><Loader2 size={14} className="sa-spin" /></div>}
        <div ref={end} />
      </div>
      <form className="cc-input" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea
          value={input}
          rows={2}
          maxLength={4000}
          placeholder="Write what's on your mind…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="primary-button" type="submit" disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 size={14} className="sa-spin" /> : <Send size={14} />}
        </button>
      </form>
      <p className="field-hint">
        Replies come from AI, not a person or licensed counsellor. This is not crisis care. {storageKey
          ? "This conversation is saved only in this browser profile under your account-specific key; anyone with access to this browser profile may see it. It is not stored in the Group 13 database."
          : "This conversation is not saved by Group 13 Hub and disappears when you leave this page."}
      </p>
      {storageKey && turns.length > 0 && (
        <button type="button" className="secondary-button" onClick={clearHistory} disabled={busy}>
          <Trash2 size={13} /> Clear local wellbeing history
        </button>
      )}
    </div>
  );
}
