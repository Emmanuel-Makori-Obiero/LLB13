import { useState } from "react";
import { BookOpen, Bot, ChevronRight, Loader2, Send, X } from "lucide-react";
import { askAI, type AIResult } from "./lib/ai";
import { findLegalTerm, searchLegalDictionary } from "./legalDictionary";
import { Markdown } from "./Markdown";
import "./floating-lawyer.css";

type AgentMessage = { role: "user" | "assistant"; text: string; result?: AIResult };

function LawyerAvatar({ small = false }: { small?: boolean }) {
  return <div className={`lawyer-avatar ${small ? "small" : ""}`} aria-hidden="true"><svg viewBox="0 0 96 96" role="presentation"><circle cx="48" cy="48" r="46" className="lawyer-avatar-bg" /><path d="M21 87c3-17 14-25 27-25s24 8 27 25" className="lawyer-robe" /><path d="M39 60l9 11 9-11" className="lawyer-collar" /><ellipse cx="48" cy="40" rx="21" ry="24" className="lawyer-face" /><path d="M27 37c3-19 11-27 22-27 12 0 20 8 21 27-6-6-13-9-21-9s-15 3-22 9Z" className="lawyer-hair" /><circle cx="40" cy="41" r="2.5" className="lawyer-eye" /><circle cx="56" cy="41" r="2.5" className="lawyer-eye" /><path d="M44 51c3 2 5 2 8 0" className="lawyer-mouth" /><path d="M69 22l9 9m-4-13-9 9" className="lawyer-gavel" /></svg></div>;
}

export default function FloatingLawyerAgent({ currentPage, onOpenDictionary }: { currentPage: string; onOpenDictionary: () => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    const next = [...messages, { role: "user" as const, text: question }];
    setMessages(next);
    const local = findLegalTerm(question.replace(/[?!.]+$/g, ""));
    if (local) {
      setMessages([...next, { role: "assistant", text: `**${local.term}**\n\n${local.definition}${local.example ? `\n\n**Example:** ${local.example}` : ""}\n\n*Study definition from the Group 13 dictionary. Check the governing Kenyan authority for your question.*` }]);
      return;
    }
    setBusy(true);
    try {
      const related = searchLegalDictionary(question).slice(0, 4).map((entry) => `${entry.term}: ${entry.definition}`).join("\n");
      const result = await askAI({ feature: "chat", mode: "general", messages: [{ role: "user", content: `You are the Group 13 Lawyer Agent, a careful Kenyan law study companion. The student is currently on the “${currentPage}” page. Answer the question directly in plain language, define legal terms, distinguish general principles from Kenyan law, and never invent a case, statute, section, quote, or current legal position. If authority is needed but not provided, say “verify the authority”. This is study support, not legal advice. Relevant local dictionary entries, if any:\n${related || "none"}\n\nStudent question: ${question}` }] });
      setMessages((current) => [...current, { role: "assistant", text: result.answer, result }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error instanceof Error ? error.message : "The lawyer agent is unavailable right now." }]);
    } finally {
      setBusy(false);
    }
  };
  return <div className={`floating-lawyer ${open ? "open" : ""}`}><button type="button" className="floating-lawyer-trigger" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close Lawyer Agent" : "Open Lawyer Agent"}><LawyerAvatar small /><span>Lawyer<br />Agent</span></button>{open && <section className="floating-lawyer-panel" aria-label="Group 13 Lawyer Agent"><header><div className="floating-lawyer-title"><LawyerAvatar small={false} /><div><strong>Lawyer Agent</strong><small>Connected to {currentPage}</small></div></div><button type="button" className="floating-lawyer-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button></header><div className="floating-lawyer-body">{messages.length === 0 && <div className="floating-lawyer-welcome"><Bot size={18} /><p>I can define a term, explain a rule, help with a case, or point you to the right Group 13 page.</p><div className="floating-lawyer-quick"><button type="button" onClick={() => setInput("Define consideration")}>Define a term <ChevronRight size={13} /></button><button type="button" onClick={onOpenDictionary}><BookOpen size={13} /> Open dictionary</button></div></div>}{messages.map((message, index) => <div className={`floating-lawyer-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "You" : "Agent"}</span>{message.role === "assistant" ? <Markdown text={message.text} /> : <p>{message.text}</p>}</div>)}{busy && <div className="floating-lawyer-thinking"><Loader2 size={14} className="floating-lawyer-spin" /> Reviewing the legal question…</div>}</div><form className="floating-lawyer-form" onSubmit={(event) => void submit(event)}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about a legal term or problem…" aria-label="Ask Lawyer Agent" /><button type="submit" disabled={busy || !input.trim()} aria-label="Send question"><Send size={15} /></button></form></section>}</div>;
}
