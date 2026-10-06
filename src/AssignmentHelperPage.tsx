import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Download, FileText, Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { Markdown } from "./Markdown";
import { askAI, type AIFeature, type AIResult } from "./lib/ai";
import { listGuideSources, type SourceChoice } from "./lib/guidedStudy";
import { downloadPdf, downloadWord } from "./export";
import type { Assignment } from "./data/types";

type Tool = { feature: AIFeature; label: string; description: string };
const tools: Tool[] = [
  { feature: "rw_question", label: "Understand the question", description: "Break down the command words, issues, scope, and what a strong answer must prove." },
  { feature: "rw_outline", label: "Build an outline", description: "Create a structured, source-grounded plan with arguments, authorities, counterarguments, and word allocation." },
  { feature: "irac", label: "Make an IRAC plan", description: "Turn a problem question into issues, rules, application points, and conclusions." },
  { feature: "rw_critique", label: "Review my draft", description: "Find gaps in reasoning, structure, authority, counterarguments, and clarity without rewriting your voice." },
  { feature: "rw_citations", label: "Check citations", description: "Format the authorities you provide and flag missing details instead of inventing them." },
];

export default function AssignmentHelperPage({ assignments }: { assignments: Assignment[] }) {
  const [sources, setSources] = useState<SourceChoice[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState("");
  const [tool, setTool] = useState<Tool>(tools[0]);
  const [result, setResult] = useState<AIResult | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "library" | "my">("all");

  const librarySources = useMemo(() => sources.filter((source) => source.kind === "document" || source.kind === "material"), [sources]);
  const selectedSources = librarySources.filter((source) => source.kind === "document" && selected.includes(source.id));
  const visibleSources = useMemo(() => librarySources.filter((source) => sourceFilter === "all" || (sourceFilter === "library" ? source.scope === "library" : source.scope !== "library")), [librarySources, sourceFilter]);
  const selectedIds = selectedSources.map((source) => source.id);
  const groundingMode = selectedSources.length > 0 && selectedSources.every((source) => source.scope === "library") ? "library" : selectedSources.some((source) => source.scope === "library") ? "auto" : "materials";

  const loadSources = async () => {
    try {
      const available = await listGuideSources();
      setSources(available);
      setNotice(available.length ? "Choose AI-readable saved documents to ground the helper. Linked Library references are shown for context but do not supply source text." : "Add an AI-readable document in the Library, then refresh sources.");
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
      selectedSources.length ? `Selected AI-readable source documents:\n${selectedSources.map((source) => `- ${source.title}${source.citation ? ` (${source.citation})` : ""}`).join("\n")}` : "",
      draft.trim() ? `Student draft or working notes:\n${draft.trim()}` : "No draft supplied yet.",
      tool.feature === "rw_outline" ? "Include a practical section-by-section outline, thesis options, counterargument, and approximate word counts." : "",
      tool.feature === "irac" ? "Do not write the final answer. Produce a study-ready IRAC plan tied to the facts." : "",
      tool.feature === "rw_critique" ? "Give specific improvements and preserve the student's own voice; do not fabricate authorities." : "",
      "Use only retrieved AI-readable source text for source-specific legal claims. Never invent authorities or citations.",
    ].filter(Boolean).join("\n\n");
    try {
      const response = await askAI({ feature: tool.feature, mode: selectedIds.length ? groundingMode : "general", docIds: selectedIds, messages: [{ role: "user", content: context }] });
      setResult(response); setNotice(response.grounded ? "Done. Case citations are tied to retrieved source text; use Kenya Law Case Finder for authorities not included there." : selectedSources.length ? "Done. No readable text was returned from the selected documents, so this is a general overview. Re-upload the source or use Kenya Law Case Finder." : "Done. This is a general overview; no source text was selected. Library reference links do not supply text to the helper.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The assignment helper could not complete this request.");
    } finally { setBusy(false); }
  };

  return <section className="assignment-helper-page">
    <div className="page-heading">
      <div><div className="eyebrow">Plan, understand, improve</div><h1 className="heading">AI Assignment Helper.</h1><p className="subheading">Paste the assignment brief, select AI-readable source documents, and work through the question step by step. It helps you think and improve; it does not submit work for you.</p></div>
      <div className="assignment-helper-icon"><FileText size={30} /></div>
    </div>
    {notice && <div className="guide-notice">{notice}</div>}
    <div className="assignment-helper-grid">
      <div className="card card-pad assignment-helper-form">
        <div className="section-label">1. Your assignment</div>
        <label>Link an existing assignment <span className="field-hint">Selecting one loads its title and brief; you can still edit them.</span><select value={assignmentId} onChange={(event) => { const next = assignments.find((assignment) => assignment.id === event.target.value); setAssignmentId(event.target.value); if (next) { setTitle(next.title); setBrief(next.brief); } }}><option value="">Choose an assignment…</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title} · {assignment.unit}</option>)}</select></label>
        <label>Title or topic<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Negligence and the duty of care" /></label>
        <label>Assignment question or brief<textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={8} placeholder="Paste the exact question, instructions, word count, deadline, and marking rubric if you have them." /></label>
        <label>Draft or working notes <span className="field-hint">Optional for question analysis; useful for review.</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={8} placeholder="Paste your introduction, outline, argument, or draft here." /></label>
        <div className="section-label">2. Choose a tool</div>
        <div className="assignment-tools">{tools.map((item) => <button type="button" key={item.feature} className={`assignment-tool ${tool.feature === item.feature ? "active" : ""}`} onClick={() => setTool(item)}><Lightbulb size={15} /><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>
        <div className="section-label">3. Choose source text</div>
        <p className="field-hint">Choose AI-readable books and documents to ground the helper. The list is scrollable so a large Library will not make the page longer.</p>
        <div className="assignment-source-toolbar" role="group" aria-label="Filter assignment sources">
          <span className="field-hint">{selectedSources.length} source{selectedSources.length === 1 ? "" : "s"} selected</span>
          <div className="assignment-source-filters">
            <button type="button" className={sourceFilter === "all" ? "active" : ""} onClick={() => setSourceFilter("all")}>All</button>
            <button type="button" className={sourceFilter === "library" ? "active" : ""} onClick={() => setSourceFilter("library")}>Library books</button>
            <button type="button" className={sourceFilter === "my" ? "active" : ""} onClick={() => setSourceFilter("my")}>My uploads</button>
          </div>
        </div>
        <div className="assignment-sources">{visibleSources.length ? visibleSources.map((source) => <label className={`assignment-source ${source.kind !== "document" ? "reference-only" : ""}`} key={`${source.kind}:${source.id}`}><input type="checkbox" checked={source.kind === "document" && selected.includes(source.id)} disabled={source.kind !== "document"} onChange={() => setSelected((current) => current.includes(source.id) ? current.filter((id) => id !== source.id) : [...current, source.id])} /><BookOpen size={14} /><span>{source.title}<small>{source.kind === "material" ? "Reference link only · upload/readable text needed for AI grounding" : source.scope === "library" ? "Library book · text supplied to AI" : "My saved document · text supplied to AI"}{source.citation ? ` · ${source.citation}` : ""}</small></span></label>) : <p className="empty">No sources in this filter. Add source text in Library, then refresh.</p>}</div>
        <div className="assignment-actions"><button className="secondary-button" onClick={() => void loadSources()}><RefreshCw size={13} /> Refresh sources</button><button className="primary-button" onClick={() => void run()} disabled={busy || !brief.trim()}><Sparkles size={14} /> {busy ? "Working…" : tool.label}</button></div>
      </div>
      <div className="card card-pad assignment-helper-result"><div className="assignment-result-head"><div className="section-label">Your tutor's response</div>{result && <div className="export-actions"><button className="secondary-button small-action" onClick={() => downloadWord(title || "Assignment helper", result.answer, "assignment-helper.doc", { eyebrow: "Group 13 · Assignment helper", subtitle: title || "Study notes", sources: selectedSources.map((source) => source.title) })}><Download size={13} /> Word</button><button className="secondary-button small-action" onClick={() => downloadPdf(title || "Assignment helper", result.answer, "assignment-helper.pdf", { eyebrow: "Group 13 · Assignment helper", subtitle: title || "Study notes", sources: selectedSources.map((source) => source.title) })}><Download size={13} /> PDF</button></div>}</div>{result ? <><div className="assignment-result-meta"><CheckCircle2 size={15} /> {result.grounded ? "Grounded in selected sources" : "General legal overview"}{assignmentId ? ` · Linked to ${assignments.find((assignment) => assignment.id === assignmentId)?.title ?? "assignment"}` : ""}</div><Markdown text={result.answer} />{result.warnings.length > 0 && <div className="assignment-warnings"><strong>Source note</strong>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}</> : <div className="assignment-empty"><Sparkles size={28} /><h2>Start with the question</h2><p>Choose an assignment or paste the question, then select AI-readable source text to ground your work.</p></div>}</div>
    </div>
  </section>;
}
