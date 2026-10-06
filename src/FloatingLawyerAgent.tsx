import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { BookOpen, Bot, ChevronRight, Download, FileText, History, Image as ImageIcon, Loader2, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { askAI, uploadMaterial, type AIMessage, type AIResult } from "./lib/ai";
import { analyzeImage, generateImage } from "./lib/cloudMedia";
import { downloadPdf, downloadWord } from "./export";
import { findLegalTerm, searchLegalDictionary } from "./legalDictionary";
import { searchKenyaCauseLists, searchKenyaLaw } from "./lib/kenyaLaw";
import { Markdown } from "./Markdown";
import StorytellButton from "./StorytellButton";
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
function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function LawyerAvatar({ small = false }: { small?: boolean }) {
  return <div className={`lawyer-avatar ${small ? "small" : ""}`} aria-hidden="true"><svg viewBox="0 0 96 96" role="presentation"><circle cx="48" cy="48" r="46" className="lawyer-avatar-bg" /><path d="M21 87c3-17 14-25 27-25s24 8 27 25" className="lawyer-robe" /><path d="M39 60l9 11 9-11" className="lawyer-collar" /><ellipse cx="48" cy="40" rx="21" ry="24" className="lawyer-face" /><path d="M27 37c3-19 11-27 22-27 12 0 20 8 21 27-6-6-13-9-21-9s-15 3-22 9Z" className="lawyer-hair" /><circle cx="40" cy="41" r="2.5" className="lawyer-eye" /><circle cx="56" cy="41" r="2.5" className="lawyer-eye" /><path d="M44 51c3 2 5 2 8 0" className="lawyer-mouth" /><path d="M69 22l9 9m-4-13-9 9" className="lawyer-gavel" /></svg></div>;
}

export default function FloatingLawyerAgent({ currentPage, onOpenDictionary, historyKey = "workspace" }: { currentPage: string; onOpenDictionary: () => void; historyKey?: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; data: string; mime: string } | null>(null);
  const [attachmentNote, setAttachmentNote] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
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
    setAttachment(null);
    setAttachmentNote("");
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
  const handleAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAttachmentNote("");
    if (file.type.startsWith("image/")) {
      if (file.size > 18 * 1024 * 1024) { setAttachmentNote("Choose an image under 18 MB."); return; }
      const reader = new FileReader();
      reader.onload = () => { setAttachment({ name: file.name, data: String(reader.result), mime: file.type || "image/png" }); setAttachmentNote(`${file.name} ready. Ask me to explain or revise it.`); };
      reader.readAsDataURL(file);
      return;
    }
    setBusy(true);
    try {
      const result = await uploadMaterial(file);
      setAttachmentNote(`${file.name} uploaded and indexed (${result.chunks} sections). Ask a question about it.`);
      setAttachment({ name: file.name, data: result.id, mime: "document" });
    } catch (error) { setAttachmentNote(error instanceof Error ? error.message : "Could not upload that file."); }
    finally { setBusy(false); }
  };
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const question = input.trim() || (attachment ? (attachment.mime.startsWith("image/") ? "Explain this image clearly and point out anything important or unclear." : `Use my uploaded file ${attachment.name} to answer my question.`) : "");
    if (!question || busy || !activeThread) return;
    setInput("");
    const next = [...messages, { role: "user" as const, text: attachment ? `${question}

[Attachment: ${attachment.name}]` : question }];
    updateMessages(next);
    const currentAttachment = attachment;
    setAttachment(null);
    const wantsImage = /\b(generate|create|draw|illustrate|make|design)\b[\s\S]*\b(image|diagram|illustration|picture|chart|graphic)\b/i.test(question);
    if (currentAttachment?.mime.startsWith("image/")) {
      setBusy(true);
      try {
        const result = wantsImage
          ? await generateImage({ operation: "edit", prompt: `Revise the uploaded image as requested. Preserve all details not mentioned and keep labels accurate. ${question}`, image_base64: currentAttachment.data, image_mime_type: currentAttachment.mime })
          : await analyzeImage({ prompt: question, image_base64: currentAttachment.data, image_mime_type: currentAttachment.mime });
        const text = "analysis" in result
          ? `**Image analysis**\n\n${result.analysis}`
          : `**Image ready**\n\n![Generated image](${result.signed_url})\n\nI saved this image in Cloud media. You can ask me to revise it further by uploading it again with another instruction.`;
        updateMessages([...next, { role: "assistant", text }]);
      } catch (error) { updateMessages([...next, { role: "assistant", text: error instanceof Error ? error.message : "The image tool is unavailable right now." }]); }
      finally { setBusy(false); }
      return;
    }
    if (wantsImage) {
      setBusy(true);
      try {
        const result = await generateImage({ prompt: question });
        updateMessages([...next, { role: "assistant", text: `**Generated image**\n\n![Generated image](${result.signed_url})\n\nThe image is saved in Cloud media. Ask me for another variation or upload an image for revision.` }]);
      } catch (error) { updateMessages([...next, { role: "assistant", text: error instanceof Error ? error.message : "The image generator is unavailable right now." }]); }
      finally { setBusy(false); }
      return;
    }
    const local = findLegalTerm(question.replace(/[?!.]+$/g, ""));
    if (local) {
      updateMessages([...next, { role: "assistant", text: `**${local.term}**\n\n${local.definition}${local.example ? `\n\n**Example:** ${local.example}` : ""}\n\n*Study definition from the Group 13 dictionary. Check the governing Kenyan authority for your question.*` }]);
      return;
    }
    const wantsCauseList = /\b(cause\s*list|causelist|court\s+schedule|scheduled\s+(case|hearing)|court\s+case(?:s)?\s+(today|tomorrow|upcoming)|case(?:s)?\s+(today|tomorrow|upcoming)\s+(at|in)\s+[a-z][a-z -]{2,40}|(?:case|matter|hearing)s?\b.{0,50}\b(today|tomorrow|upcoming)\b)/i.test(question);
    if (wantsCauseList) {
      setBusy(true);
      try {
        const today = localDate();
        const dates = /\btoday\b/i.test(question)
          ? { fromDate: today, toDate: today }
          : /\b(upcoming|tomorrow)\b/i.test(question)
            ? { fromDate: today, toDate: localDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)) }
            : undefined;
        const response = await searchKenyaCauseLists(`${question} cause list`, dates);
        const text = response.results.length
          ? `**Official court cause-list results**\n\n${response.results.map((result) => `- [${result.title}](${result.url})${result.dateRange ? ` — ${result.dateRange}` : ""}`).join("\n")}\n\n[Open the Judiciary Causelist Portal](${response.judiciaryPortalUrl}) · [Open the Kenya Law cause-list search](${response.officialSearchUrl})\n\n*${response.caveat}*`
          : `I could not find a matching public court cause-list document. [Open the Judiciary Causelist Portal](${response.judiciaryPortalUrl}) to select the court, station, division and date filters.\n\n*${response.caveat}*`;
        updateMessages([...next, { role: "assistant", text }]);
      } catch (error) {
        updateMessages([...next, { role: "assistant", text: error instanceof Error ? error.message : "The official cause-list search is unavailable right now." }]);
      } finally {
        setBusy(false);
      }
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
      const result = await askAI({ feature: "chat", mode: "general", messages: [...prior, { role: "user", content: `You are the Group 13 Lawyer Agent, a careful Kenyan law study companion. The student is currently on the “${currentPage}” page. Continue the conversation using its earlier context. Answer directly in plain language, define legal terms, distinguish general principles from Kenyan law, and never invent a case, statute, section, quote, or current legal position. If authority is needed but not provided, say “verify the authority”. This is study support, not legal advice. Relevant local dictionary entries, if any:\n${related || "none"}\n\nStudent question: ${question}` }], docIds: currentAttachment?.mime === "document" ? [currentAttachment.data] : undefined });
      updateMessages([...next, { role: "assistant", text: result.answer, result }]);
    } catch (error) {
      updateMessages([...next, { role: "assistant", text: error instanceof Error ? error.message : "The lawyer agent is unavailable right now." }]);
    } finally {
      setBusy(false);
    }
  };

  return <div className={`floating-lawyer ${open ? "open" : ""}`}><button type="button" className="floating-lawyer-trigger" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close Lawyer Agent" : "Open Lawyer Agent"}><LawyerAvatar small /><span>Lawyer<br />Agent</span></button>{open && <section className="floating-lawyer-panel" aria-label="Group 13 Lawyer Agent"><header><div className="floating-lawyer-title"><LawyerAvatar /><div><strong>Lawyer Agent</strong><small>Connected to {currentPage}</small></div></div><div className="floating-lawyer-header-actions"><button type="button" onClick={startNew} aria-label="New conversation" title="New conversation"><Plus size={15} /></button><button type="button" onClick={() => setShowHistory((value) => !value)} aria-label="Conversation history" title="Conversation history"><History size={15} /></button><button type="button" className="floating-lawyer-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button></div></header>{showHistory ? <div className="floating-lawyer-history"><div className="floating-lawyer-history-head"><strong>Conversation history</strong><button type="button" onClick={startNew}><Plus size={13} /> New</button></div>{threads.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((thread) => <div className={`floating-lawyer-history-row ${thread.id === activeId ? "active" : ""}`} key={thread.id}><button type="button" onClick={() => selectThread(thread.id)}><strong>{thread.title}</strong><small>{thread.messages.length} messages · {new Date(thread.updatedAt).toLocaleDateString()}</small></button><button type="button" onClick={() => deleteThread(thread.id)} aria-label={`Delete ${thread.title}`}><Trash2 size={13} /></button></div>)}</div> : <><div className="floating-lawyer-body">{messages.length === 0 && <div className="floating-lawyer-welcome"><Bot size={18} /><p>I can define a term, explain a rule, help with a case, or point you to the right Group 13 page. Your conversations are saved on this device.</p><div className="floating-lawyer-quick"><button type="button" onClick={() => setInput("Define consideration")}>Define a term <ChevronRight size={13} /></button><button type="button" onClick={onOpenDictionary}><BookOpen size={13} /> Open dictionary</button></div></div>}{messages.map((message, index) => <div className={`floating-lawyer-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "You" : "Agent"}</span>{message.role === "assistant" ? <><Markdown text={message.text} /><StorytellButton title="Lawyer Agent explanation" source={message.text} /></> : <p>{message.text}</p>}</div>)}{busy && <div className="floating-lawyer-thinking"><Loader2 size={14} className="floating-lawyer-spin" /> Reviewing the legal question…</div>}</div><div className="floating-lawyer-export">{messages.some((message) => message.role === "assistant") && <><span><FileText size={12} /> Save this conversation</span><button type="button" onClick={() => exportSession("word")}><Download size={12} /> Word</button><button type="button" onClick={() => exportSession("pdf")}><Download size={12} /> PDF</button></>}</div><form className="floating-lawyer-form" onSubmit={(event) => void submit(event)}><input ref={fileRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.rtf,.json,.html,application/*,text/*" onChange={(event) => void handleAttachment(event)} /><button type="button" className="floating-lawyer-attach" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Attach a file or image" title="Attach a file or image"><Paperclip size={15} /></button><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask, upload a file, or request an image…" aria-label="Ask Lawyer Agent" /><button type="submit" disabled={busy || (!input.trim() && !attachment)} aria-label="Send question"><Send size={15} /></button></form>{attachmentNote && <div className="floating-lawyer-attachment-note"><ImageIcon size={12} /> {attachmentNote} {attachment && <button type="button" onClick={() => { setAttachment(null); setAttachmentNote(""); }}>Remove</button>}</div>}</>}</section>}</div>;
}
