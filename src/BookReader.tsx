import { useState, type FormEvent } from "react";
import { BookOpen, Check, Highlighter, Maximize2, Minimize2, Send, Sparkles, X } from "lucide-react";
import { downloadInfo, readerUrl, safeUrl } from "./links";
import { askAI, type AIResult } from "./lib/ai";
import { Markdown } from "./Markdown";
import type { Material } from "./data/types";
import "./book-reader.css";

type Highlight = { id: string; text: string; createdAt: string };
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
    const task = customPrompt.trim() && customPrompt.trim() !== passage ? customPrompt.trim() : instruction;
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

  const hasPassage = Boolean(selectedText || activeHighlight || customPrompt.trim());

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
        <section className="book-reading-pane">
          <div className="book-pane-head"><div><span className="section-label">Preview</span><p className="field-hint">The source opens directly here. Copy any passage you want to study.</p></div><BookOpen size={18} /></div>
          {frame ? (
            <div className="book-preview-wrap">
              {info?.file && /\.pdf(\?|$)/i.test(material.storage_path ?? material.url ?? "") ? <object data={frame} type="application/pdf" aria-label={`Preview ${material.title}`}><iframe src={frame} title={`Preview ${material.title}`} /></object> : <iframe src={frame} title={`Preview ${material.title}`} referrerPolicy="no-referrer" />}
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
          {error && <div className="connection-error">{error}</div>}
          {result && <div className="book-result"><div className="sa-basis"><span className={`sa-badge ${result.grounded ? "grounded" : "open"}`}>{result.grounded ? "From your passage" : "General context"}</span></div><Markdown text={result.answer} />{result.warnings.length > 0 && <ul className="sa-warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</div>}
          <div className="book-highlights"><div className="section-label">Saved highlights · {highlights.length}</div>{highlights.length === 0 ? <p className="field-hint">Your saved passages will stay with this book on this device.</p> : highlights.map((highlight) => <div className={`book-highlight ${activeHighlight === highlight.id ? "on" : ""}`} key={highlight.id}><button onClick={() => { setActiveHighlight(highlight.id); setSelectedText(highlight.text); }}><Check size={13} />{highlight.text}</button><button className="book-delete" onClick={() => persist(highlights.filter((item) => item.id !== highlight.id))} aria-label="Delete highlight">×</button></div>)}</div>
        </aside>
      </div>
    </div>
  );
}
