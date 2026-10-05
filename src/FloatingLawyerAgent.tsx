import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, Bot, ChevronRight, Download, FileText, History, Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { askAI, type AIMessage, type AIResult } from "./lib/ai";
import { downloadPdf, downloadWord } from "./export";
import { findLegalTerm, searchLegalDictionary } from "./legalDictionary";
import { searchKenyaLaw } from "./lib/kenyaLaw";
import { Markdown } from "./Markdown";
import "./floating-lawyer.css";

type AgentMessage = { role: "user" | "assistant"; text: string; result?: AIResult };
type AgentThread = { id: string; title: string; messages: AgentMessage[]; updatedAt: number };

function storageKey(identity: string) {
  return `g13.lawyer-agent.history.${identity.toLowerCase()}`;
}
function readThreads(identity: string): AgentThread[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(identity)) ?? "[]") as AgentThread[];
    return Array.isArray(saved) ? saved.filter((thread) => thread?.id && Array.isArray(thread.messages)) : [];
  } catch {
    return [];
  }
}
function newThread(): AgentThread {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: "New legal conversation", messages: [], updatedAt: Date.now() };
}
function safeFilename(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "lawyer-agent-session";
}

function LawyerAvatar({ small = false }: { small?: boolean }) {
  return <div className={`lawyer-avatar ${small ? "small" : ""}`} aria-hidden="true"><svg viewBox="0 0 96 96" role="presentation"><circle cx="48" cy="48" r="46" className="lawyer-avatar-bg" /><path d="M21 87c3-17 14-25 27-25s24 8 27 25" className="lawyer-robe" /><path d="M39 60l9 11 9-11" className="lawyer-collar" /><ellipse cx="48" cy="40" rx="21" ry="24" className="lawyer-face" /><path d="M27 37c3-19 11-27 22-27 12 0 20 8 21 27-6-6-13-9-21-9s-15 3-22 9Z" className="lawyer-hair" /><circle cx="40" cy="41" r="2.5" className="lawyer-eye" /><circle cx="56" cy="41" r="2.5" className="lawyer-eye" /><path d="M44 51c3 2 5 2 8 0" className="lawyer-mouth" /><path d="M69 22l9 9m-4-13-9 9" className="lawyer-gavel" /></svg></div>;
}

export default function FloatingLawyerAgent({ currentPage, onOpenDictionary, historyKey = "workspace" }: { currentPage: string; onOpenDictionary: () => void; historyKey?: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [activeId, setActiveId] = useState("");
  const activeThread = threads.find((thread) => thread.id === activeId) ?? threads[0];
  const messages = activeThread?.messages ?? [];

  useEffect(() => {
    const existing = readThreads(historyKey);
    const initial = existing.length ? existing : [newThread()];
    setThreads(initial);
    setActiveId(initial[0].id);
    setHydrated(true);
  }, [historyKey]);
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(storageKey(historyKey), JSON.stringify(threads.slice(0, 20)));
  }, [hydrated, historyKey, threads]);

  const updateMessages = (next: AgentMessage[]) => {
    setThreads((current) => current.map((thread) => thread.id === activeId ? { ...thread, messages: next, title: thread.messages.length ? thread.title : (next.find((message) => message.role === "user")?.text.slice(0, 48) || thread.title), updatedAt: Date.now() } : thread));
  };
  const startNew = () => {
    const thread = newThread();
    setThreads((current) => [thread, ...current]);
    setActiveId(thread.id);
    setShowHistory(false);
    setInput("");
  };
  const selectThread = (id: string) => {
    setActiveId(id);
    setShowHistory(false);
  };
  const deleteThread = (id: string) => {
    setThreads((current) => {
      const remaining = current.filter((thread) => thread.id !== id);
      const next = remaining.length ? remaining : [newThread()];
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };
  const exportText = useMemo(() => messages.map((message) => `${message.role === "user" ? "## You" : "## Lawyer Agent"}\n\n${message.text}`).join("\n\n"), [messages]);
  const exportSession = (kind: "word" | "pdf") => {
    if (!exportText || !activeThread) return;
    const title = activeThread.title === "New legal conversation" ? "Lawyer Agent conversation" : activeThread.title;
    const options = { eyebrow: "Group 13 · Lawyer Agent", subtitle: `Conversation continued from the ${currentPage} page`, footer: "Study support only · Verify current Kenyan authorities before relying on this document" };
    const filename = `${safeFilename(title)}.${kind === "word" ? "doc" : "pdf"}`;
    if (kind === "word") downloadWord(title, exportText, filename, options);
    else downloadPdf(title, exportText, filename, options);
  };
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const question = input.trim();
    if (!question || busy || !activeThread) return;
    setInput("");
    const next = [...messages, { role: "user" as const, text: question }];
    updateMessages(next);
    const local = findLegalTerm(question.replace(/[?!.]+$/g, ""));
    if (local) {
      updateMessages([...next, { role: "assistant", text: `**${local.term}**\n\n${local.definition}${local.example ? `\n\n**Example:** ${local.example}` : ""}\n\n*Study definition from the Group 13 dictionary. Check the governing Kenyan authority for your question.*` }]);
      return;
    }
    const wantsCaseSearch = /\b(find|search|look up|locate)\b[\s\S]*\b(case|judgment|kenya law|citation)\b/i.test(question);
    if (wantsCaseSearch) {
      setBusy(true);
      try {
        const results = await searchKenyaLaw(question);
        const text = results.length
          ? `**Official Kenya Law results**\n\n${results.map((result) => `- [${result.title}](${result.url})${result.citation ? ` — ${result.citation}` : ""}`).join("\n")}\n\nThese links were found from public Kenya Law case pages. Open the specific judgment to verify the full text and current status.`
          : "I could not find an official Kenya Law judgment link for that query. Try the case name, citation, statute, or legal issue with fewer words.";
        updateMessages([...next, { role: "assistant", text }]);
      } catch (error) {
        updateMessages([...next, { role: "assistant", text: error instanceof Error ? error.message : "The free Kenya Law search is unavailable right now." }]);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const related = searchLegalDictionary(question).slice(0, 4).map((entry) => `${entry.term}: ${entry.definition}`).join("\n");
      const prior: AIMessage[] = messages.slice(-10).map((message) => ({ role: message.role, content: message.text }));
      const result = await askAI({ feature: "chat", mode: "general", messages: [...prior, { role: "user", content: `You are the Group 13 Lawyer Agent, a careful Kenyan law study companion. The student is currently on the “${currentPage}” page. Continue the conversation using its earlier context. Answer directly in plain language, define legal terms, distinguish general principles from Kenyan law, and never invent a case, statute, section, quote, or current legal position. If authority is needed but not provided, say “verify the authority”. This is study support, not legal advice. Relevant local dictionary entries, if any:\n${related || "none"}\n\nStudent question: ${question}` }] });
      updateMessages([...next, { role: "assistant", text: result.answer, result }]);
    } catch (error) {
      updateMessages([...next, { role: "assistant", text: error instanceof Error ? error.message : "The lawyer agent is unavailable right now." }]);
    } finally {
      setBusy(false);
    }
  };

  return <div className={`floating-lawyer ${open ? "open" : ""}`}><button type="button" className="floating-lawyer-trigger" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close Lawyer Agent" : "Open Lawyer Agent"}><LawyerAvatar small /><span>Lawyer<br />Agent</span></button>{open && <section className="floating-lawyer-panel" aria-label="Group 13 Lawyer Agent"><header><div className="floating-lawyer-title"><LawyerAvatar /><div><strong>Lawyer Agent</strong><small>Connected to {currentPage}</small></div></div><div className="floating-lawyer-header-actions"><button type="button" onClick={startNew} aria-label="New conversation" title="New conversation"><Plus size={15} /></button><button type="button" onClick={() => setShowHistory((value) => !value)} aria-label="Conversation history" title="Conversation history"><History size={15} /></button><button type="button" className="floating-lawyer-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button></div></header>{showHistory ? <div className="floating-lawyer-history"><div className="floating-lawyer-history-head"><strong>Conversation history</strong><button type="button" onClick={startNew}><Plus size={13} /> New</button></div>{threads.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((thread) => <div className={`floating-lawyer-history-row ${thread.id === activeId ? "active" : ""}`} key={thread.id}><button type="button" onClick={() => selectThread(thread.id)}><strong>{thread.title}</strong><small>{thread.messages.length} messages · {new Date(thread.updatedAt).toLocaleDateString()}</small></button><button type="button" onClick={() => deleteThread(thread.id)} aria-label={`Delete ${thread.title}`}><Trash2 size={13} /></button></div>)}</div> : <><div className="floating-lawyer-body">{messages.length === 0 && <div className="floating-lawyer-welcome"><Bot size={18} /><p>I can define a term, explain a rule, help with a case, or point you to the right Group 13 page. Your conversations are saved on this device.</p><div className="floating-lawyer-quick"><button type="button" onClick={() => setInput("Define consideration")}>Define a term <ChevronRight size={13} /></button><button type="button" onClick={onOpenDictionary}><BookOpen size={13} /> Open dictionary</button></div></div>}{messages.map((message, index) => <div className={`floating-lawyer-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "You" : "Agent"}</span>{message.role === "assistant" ? <Markdown text={message.text} /> : <p>{message.text}</p>}</div>)}{busy && <div className="floating-lawyer-thinking"><Loader2 size={14} className="floating-lawyer-spin" /> Reviewing the legal question…</div>}</div><div className="floating-lawyer-export">{messages.some((message) => message.role === "assistant") && <><span><FileText size={12} /> Save this conversation</span><button type="button" onClick={() => exportSession("word")}><Download size={12} /> Word</button><button type="button" onClick={() => exportSession("pdf")}><Download size={12} /> PDF</button></>}</div><form className="floating-lawyer-form" onSubmit={(event) => void submit(event)}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about a legal term or problem…" aria-label="Ask Lawyer Agent" /><button type="submit" disabled={busy || !input.trim()} aria-label="Send question"><Send size={15} /></button></form></>}</section>}</div>;
}
