import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Download, FileText, Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { Markdown } from "./Markdown";
import { askAI, type AIFeature, type AIResult } from "./lib/ai";
import { listGuideSources, type SourceChoice } from "./lib/guidedStudy";
import { downloadPdf, downloadWord } from "./export";

type Tool = { feature: AIFeature; label: string; description: string };
const tools: Tool[] = [
  { feature: "rw_question", label: "Understand the question", description: "Break down the command words, issues, scope, and what a strong answer must prove." },
  { feature: "rw_outline", label: "Build an outline", description: "Create a structured, source-grounded plan with arguments, authorities, counterarguments, and word allocation." },
  { feature: "irac", label: "Make an IRAC plan", description: "Turn a problem question into issues, rules, application points, and conclusions." },
  { feature: "rw_critique", label: "Review my draft", description: "Find gaps in reasoning, structure, authority, counterarguments, and clarity without rewriting your voice." },
  { feature: "rw_citations", label: "Check citations", description: "Format the authorities you provide and flag missing details instead of inventing them." },
];

export default function AssignmentHelperPage() {
  const [sources, setSources] = useState<SourceChoice[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState("");
  const [tool, setTool] = useState<Tool>(tools[0]);
  const [result, setResult] = useState<AIResult | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const documentSources = useMemo(() => sources.filter((source) => source.kind === "document"), [sources]);
  const selectedSources = documentSources.filter((source) => selected.includes(source.id));
  const selectedIds = selectedSources.map((source) => source.id);
  const groundingMode = selectedSources.length > 0 && selectedSources.every((source) => source.scope === "library") ? "library" : selectedSources.some((source) => source.scope === "library") ? "auto" : "materials";

  const loadSources = async () => {
    try {
      const available = await listGuideSources();
      setSources(available);
      setNotice(available.length ? "Select the books or saved documents that should ground the helper." : "Upload or save a book/document in the Library first.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load your saved sources.");
    }
  };
  useEffect(() => { void loadSources(); }, []);

  const run = async () => {
    if (!brief.trim()) { setNotice("Paste the assignment question or brief first."); return; }
    setBusy(true); setResult(null); setNotice("The assignment helper is working from your brief and selected sources…");
    const context = [
      `Assignment title: ${title || "Untitled assignment"}`,
      `Assignment brief/question:\n${brief.trim()}`,
      draft.trim() ? `Student draft or working notes:\n${draft.trim()}` : "No draft supplied yet.",
      tool.feature === "rw_outline" ? "Include a practical section-by-section outline, thesis options, counterargument, and approximate word counts." : "",
      tool.feature === "irac" ? "Do not write the final answer. Produce a study-ready IRAC plan tied to the facts." : "",
      tool.feature === "rw_critique" ? "Give specific improvements and preserve the student's own voice; do not fabricate authorities." : "",
      "Use only the selected sources for source-specific claims. Mark anything requiring verification with (verify).",
    ].filter(Boolean).join("\n\n");
    try {
      const response = await askAI({ feature: tool.feature, mode: selectedIds.length ? groundingMode : "general", docIds: selectedIds, messages: [{ role: "user", content: context }] });
      setResult(response); setNotice("Done. Check every authority against the original book, case, statute, or lecturer material before submitting.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The assignment helper could not complete this request.");
    } finally { setBusy(false); }
  };

  return <section className="assignment-helper-page">
    <div className="page-heading">
      <div><div className="eyebrow">Plan, understand, improve</div><h1 className="heading">AI Assignment Helper.</h1><p className="subheading">Paste the assignment brief, choose your source books, and work through the question step by step. It helps you think and improve—it does not submit work for you.</p></div>
      <div className="assignment-helper-icon"><FileText size={30} /></div>
    </div>
    {notice && <div className="guide-notice">{notice}</div>}
    <div className="assignment-helper-grid">
      <div className="card card-pad assignment-helper-form">
        <div className="section-label">1. Your assignment</div>
        <label>Title or topic<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Negligence and the duty of care" /></label>
        <label>Assignment question or brief<textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={8} placeholder="Paste the exact question, instructions, word count, deadline, and marking rubric if you have them." /></label>
        <label>Draft or working notes <span className="field-hint">Optional for question analysis; useful for review.</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={8} placeholder="Paste your introduction, outline, argument, or draft here." /></label>
        <div className="section-label">2. Choose a tool</div>
        <div className="assignment-tools">{tools.map((item) => <button type="button" key={item.feature} className={`assignment-tool ${tool.feature === item.feature ? "active" : ""}`} onClick={() => setTool(item)}><Lightbulb size={15} /><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>
        <div className="section-label">3. Ground it in your books</div>
        <div className="assignment-sources">{documentSources.length ? documentSources.map((source) => <label className="assignment-source" key={source.id}><input type="checkbox" checked={selected.includes(source.id)} onChange={() => setSelected((current) => current.includes(source.id) ? current.filter((id) => id !== source.id) : [...current, source.id])} /><BookOpen size={14} /><span>{source.title}<small>{source.scope === "library" ? "Library book" : "My saved document"}{source.citation ? ` · ${source.citation}` : ""}</small></span></label>) : <p className="empty">No books or saved documents yet. Add a readable book in Library first.</p>}</div>
        <div className="assignment-actions"><button className="secondary-button" onClick={() => void loadSources()}><RefreshCw size={13} /> Refresh sources</button><button className="primary-button" onClick={() => void run()} disabled={busy || !brief.trim()}><Sparkles size={14} /> {busy ? "Working…" : tool.label}</button></div>
      </div>
      <div className="card card-pad assignment-helper-result"><div className="assignment-result-head"><div className="section-label">Your tutor's response</div>{result && <div className="export-actions"><button className="secondary-button small-action" onClick={() => downloadWord(title || "Assignment helper", result.answer, "assignment-helper.doc", { eyebrow: "Group 13 · Assignment helper", subtitle: title || "Study notes", sources: selectedSources.map((source) => source.title) })}><Download size={13} /> Word</button><button className="secondary-button small-action" onClick={() => downloadPdf(title || "Assignment helper", result.answer, "assignment-helper.pdf", { eyebrow: "Group 13 · Assignment helper", subtitle: title || "Study notes", sources: selectedSources.map((source) => source.title) })}><Download size={13} /> PDF</button></div>}</div>{result ? <><div className="assignment-result-meta"><CheckCircle2 size={15} /> {result.grounded ? "Grounded in selected sources" : "General guidance — verify authorities"}</div><Markdown text={result.answer} />{result.warnings.length > 0 && <div className="assignment-warnings"><strong>Verify before submitting</strong>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}</> : <div className="assignment-empty"><Sparkles size={28} /><h2>Start with the question</h2><p>Choose “Understand the question” first. Then use the outline, IRAC, review, and citation tools as your work develops.</p></div>}</div>
    </div>
  </section>;
}
