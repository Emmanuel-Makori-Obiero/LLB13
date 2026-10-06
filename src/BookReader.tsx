import { useState, type FormEvent } from "react";
import { BookOpen, Check, Highlighter, Maximize2, Minimize2, Minus, Plus, Send, Sparkles, X } from "lucide-react";
import { downloadInfo, readerUrl, safeUrl } from "./links";
import { askAI, type AIResult } from "./lib/ai";
import { Markdown } from "./Markdown";
import StorytellButton from "./StorytellButton";
import type { Material } from "./data/types";
import { downloadBlob, downloadPdf, downloadWord } from "./export";
import "./book-reader.css";

type Highlight = { id: string; text: string; createdAt: string };
type ChatLine = { role: "student" | "assistant"; text: string };
type Props = { material: Material; onClose: () => void };

const prompts = [
  { label: "Layman's language", value: "Explain this passage in simple, plain-English language for a law student. Define difficult words and keep the legal meaning accurate." },
  { label: "Story mode", value: "Turn this passage into a memorable short story or real-life scenario. After the story, state the legal lesson in one clear paragraph." },
  { label: "Presentation", value: "Turn this passage into a presentation-ready explanation: give a short opening, 3 to 5 key points, and a closing takeaway." },
  { label: "Study guide", value: "Create a compact study guide from this passage with the rule, reasoning, example, and a quick recall question." },
];

const keyFor = (id: string) => `llb13-highlights:${id}`;

export default function BookReader({ material, onClose }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [highlights, setHighlights] = useState<Highlight[]>(() => {
    try { return JSON.parse(localStorage.getItem(keyFor(material.id)) || "[]") as Highlight[]; } catch { return []; }
  });
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  const [instruction, setInstruction] = useState(prompts[0].value);
  const [customPrompt, setCustomPrompt] = useState("");
  const [result, setResult] = useState<AIResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(125);
  const [readerHeight, setReaderHeight] = useState(560);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<ChatLine[]>([]);

  const link = safeUrl(material.url);
  const frame = readerUrl(material);
  const info = downloadInfo(material);

  const persist = (next: Highlight[]) => {
    setHighlights(next);
    localStorage.setItem(keyFor(material.id), JSON.stringify(next));
  };

  const captureSelection = () => {
    const value = window.getSelection()?.toString().trim() || "";
    if (value.length > 8) setSelectedText(value);
  };

  const saveHighlight = () => {
    const passage = selectedText || customPrompt.trim();
    if (!passage) return;
    const item = { id: crypto.randomUUID(), text: passage, createdAt: new Date().toISOString() };
    persist([item, ...highlights]);
    setActiveHighlight(item.id);
    setSelectedText(passage);
  };

  const explain = async (event?: FormEvent) => {
    event?.preventDefault();
    const passage = selectedText || (activeHighlight ? highlights.find((h) => h.id === activeHighlight)?.text : "") || customPrompt.trim();
    if (!passage) { setError("Paste or highlight a passage first."); return; }
    setBusy(true); setError(""); setResult(null);
      const task = `${customPrompt.trim() && customPrompt.trim() !== passage ? customPrompt.trim() : instruction}\nAnswer directly in plain language first. Do not begin with a question and do not add a quiz or recall question unless I explicitly ask for one.`;
    try {
      const answer = await askAI({
        feature: "explain",
        mode: "auto",
        messages: [{ role: "user", content: `${task}\n\nBook: ${material.title}\nPassage to work from:\n“${passage}”` }],
      });
      setResult(answer);
    } catch (e) { setError(e instanceof Error ? e.message : "The AI reader is unavailable right now."); }
    finally { setBusy(false); }
  };

  const sendChat = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = chatInput.trim();
    const passage = selectedText || (activeHighlight ? highlights.find((h) => h.id === activeHighlight)?.text : "") || customPrompt.trim();
    if (!message) return;
    if (!passage) { setError("Paste or highlight a passage first so the chat has book text to discuss."); return; }
    setBusy(true); setError(""); setChatInput("");
    const next = [...chat, { role: "student" as const, text: message }];
    setChat(next);
    try {
      const answer = await askAI({
        feature: "chat",
        mode: "auto",
        messages: [{ role: "user", content: `Explain first in plain language. Do not quiz me unless I ask. Book: ${material.title}\nPassage:\n“${passage}”\nConversation so far:\n${next.map((line) => `${line.role}: ${line.text}`).join("\n")}\nStudent's latest message: ${message}` }],
      });
      setChat((current) => [...current, { role: "assistant", text: answer.answer }]);
    } catch (e) { setError(e instanceof Error ? e.message : "The book chat is unavailable right now."); }
    finally { setBusy(false); }
  };

  const hasPassage = Boolean(selectedText || activeHighlight || customPrompt.trim());
  const isPdf = Boolean(info?.file && /\.pdf(\?|$)/i.test(material.storage_path ?? material.url ?? ""));
  const previewFrame = frame ? `${frame.split("#")[0]}#page=1&zoom=${zoom}` : "";
  const resultName = `${material.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "book-explanation"}-plain-language`;
  const downloadResultMarkdown = () => result && downloadBlob(new Blob([`# ${material.title}\n\n${result.answer}`], { type: "text/markdown" }), `${resultName}.md`);
  const downloadResultPdf = () => result && downloadPdf(`${material.title} — Plain-language explanation`, result.answer, `${resultName}.pdf`);
  const downloadResultWord = () => result && downloadWord(`${material.title} — Plain-language explanation`, result.answer, `${resultName}.doc`);

  return (
    <div className={`book-reader ${expanded ? "book-reader-expanded" : ""}`}>
      <div className="reader-toolbar">
        <button className="secondary-button" onClick={onClose}><X size={14} /> Back to library</button>
        <div className="reader-heading"><strong>{material.title}</strong><span>{material.unit} · {material.topic}</span></div>
        <div className="reader-actions">
          <button className="secondary-button" onClick={() => setExpanded((v) => !v)} title={expanded ? "Minimize reader" : "Maximize reader"}>
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}<span>{expanded ? "Minimize" : "Maximize"}</span>
          </button>
          {(info?.href || link) && <a className="primary-button" href={info?.href || link} target="_blank" rel="noreferrer">Open source</a>}
        </div>
      </div>

      <div className="book-reader-grid">
          <section className="book-reading-pane" style={{ height: `${readerHeight + 84}px` }}>
          <div className="book-pane-head"><div><span className="section-label">Preview</span><p className="field-hint">The source opens directly here. Copy any passage you want to study.</p></div><div className="reader-zoom-controls" aria-label="Preview size controls"><button className="secondary-button" onClick={() => setZoom((value) => Math.max(60, value - 10))} title="Zoom out"><Minus size={13} /></button><strong>{zoom}%</strong><button className="secondary-button" onClick={() => setZoom((value) => Math.min(200, value + 10))} title="Zoom in"><Plus size={13} /></button><label className="reader-height-control">Height <input type="range" min="360" max="900" step="20" value={readerHeight} onChange={(event) => setReaderHeight(Number(event.target.value))} /> <strong>{readerHeight}px</strong></label></div><BookOpen size={18} /></div>
          {frame ? (
            <div className="book-preview-wrap" style={{ height: `${readerHeight}px` }}>
              {isPdf ? <object data={previewFrame} type="application/pdf" aria-label={`Preview ${material.title}`}><iframe src={previewFrame} title={`Preview ${material.title}`} /></object> : <iframe src={previewFrame} title={`Preview ${material.title}`} referrerPolicy="no-referrer" />}
              <p className="reader-hint">Preview only — no background extraction or loading wait. Copy a passage and paste it into the AI reading desk.</p>
            </div>
          ) : <div className="empty">This material has no valid preview link.</div>}
        </section>

        <aside className="book-ai-pane">
          <div className="book-ai-head"><div><span className="section-label">AI reading desk</span><h2>Understand it better.</h2></div><Sparkles size={18} /></div>
          <p className="field-hint">Paste a passage from the preview below, or use a saved highlight. The answer will be based on the text you provide.</p>
          <div className="book-actions">
            <button className="secondary-button" onClick={saveHighlight} disabled={!hasPassage}><Highlighter size={14} /> Save passage</button>
            {selectedText && <button className="book-clear" onClick={() => setSelectedText("")}>Clear selection</button>}
          </div>
          {selectedText && <blockquote className="book-selection">{selectedText}</blockquote>}
          <textarea className="book-paste" rows={5} value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="Paste a passage here, or type a custom instruction if you have already selected text…" />
          <div className="book-prompts">
            {prompts.map((prompt) => <button key={prompt.label} className={`book-prompt ${instruction === prompt.value ? "on" : ""}`} onClick={() => setInstruction(prompt.value)}>{prompt.label}</button>)}
          </div>
          <button className="primary-button book-explain" onClick={() => void explain()} disabled={busy || !hasPassage}><Send size={14} /> {busy ? "Thinking…" : "Explain this passage"}</button>
          <form className="book-chat" onSubmit={(event) => void sendChat(event)}><div className="section-label">Talk about this passage</div><div className="book-chat-history">{chat.length === 0 ? <p className="field-hint">Ask a follow-up after you paste or highlight a passage. The assistant explains first and only quizzes you when you ask.</p> : chat.map((line, index) => <div className={`book-chat-line ${line.role}`} key={`${line.role}-${index}`}><strong>{line.role === "student" ? "You" : "AI"}</strong><Markdown text={line.text} /></div>)}</div><div className="book-chat-entry"><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask: What does this mean in simple words?" /><button className="primary-button" type="submit" disabled={busy || !chatInput.trim()}><Send size={13} /></button></div></form>
          {error && <div className="connection-error">{error}</div>}
          {result && <div className="book-result"><div className="sa-basis"><span className={`sa-badge ${result.grounded ? "grounded" : "open"}`}>{result.grounded ? "From your passage" : "General context"}</span></div><div className="book-result-actions"><button className="secondary-button" onClick={downloadResultMarkdown}>Download .md</button><button className="secondary-button" onClick={downloadResultPdf}>Download PDF</button><button className="secondary-button" onClick={downloadResultWord}>Download Word</button></div><Markdown text={result.answer} /><StorytellButton title="Book explanation" source={result.answer} />{result.warnings.length > 0 && <ul className="sa-warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</div>}
          <div className="book-highlights"><div className="section-label">Saved highlights · {highlights.length}</div>{highlights.length === 0 ? <p className="field-hint">Your saved passages will stay with this book on this device.</p> : highlights.map((highlight) => <div className={`book-highlight ${activeHighlight === highlight.id ? "on" : ""}`} key={highlight.id}><button onClick={() => { setActiveHighlight(highlight.id); setSelectedText(highlight.text); }}><Check size={13} />{highlight.text}</button><button className="book-delete" onClick={() => persist(highlights.filter((item) => item.id !== highlight.id))} aria-label="Delete highlight">×</button></div>)}</div>
        </aside>
      </div>
    </div>
  );
}
