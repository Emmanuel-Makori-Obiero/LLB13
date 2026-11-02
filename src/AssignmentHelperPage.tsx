import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Download, FileText, Lightbulb, RefreshCw, Search, Sparkles } from "lucide-react";
import { Markdown } from "./Markdown";
import StorytellButton from "./StorytellButton";
import { askAI, countMaterialChunks, importLibraryMaterial, type AIFeature, type AIResult } from "./lib/ai";
import { listGuideSources, type SourceChoice } from "./lib/guidedStudy";
import { extractBookPartRecap, planBookSummary, requestBookSummaryPart } from "./lib/bookSummary";
import { downloadPdf, downloadWord } from "./export";
import { materialVisibleToLevel } from "./lib/learnerAdaptation";
import type { Assignment } from "./data/types";
import { supabase } from "./data/repository";

type Tool = { id: string; feature: AIFeature; label: string; description: string };
const tools: Tool[] = [
  { id: "question", feature: "rw_question", label: "Understand the question", description: "Break down the command words, issues, scope, and what a strong answer must prove." },
  { id: "outline", feature: "rw_outline", label: "Build an outline", description: "Create a structured, source-grounded plan with arguments, authorities, counterarguments, and word allocation." },
  { id: "irac", feature: "irac", label: "Make an IRAC plan", description: "Turn a problem question into issues, rules, application points, and conclusions." },
  { id: "critique", feature: "rw_critique", label: "Review my draft", description: "Find gaps in reasoning, structure, authority, counterarguments, and clarity without rewriting your voice." },
  { id: "citations", feature: "rw_citations", label: "Check citations", description: "Format the authorities you provide and flag missing details instead of inventing them." },
  { id: "book-review", feature: "rw_draft", label: "Write a book review", description: "Create an official, organized review of one AI-readable Library book with Word and PDF download." },
];
const reviewKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12000);
const reviewAngles = [
  "the development of the main characters and relationships",
  "the central ethical, political, or social tension",
  "the author's structure, language, imagery, and other writing techniques",
  "the setting and the institutions or community relationships it exposes",
  "the book's strongest argument or central idea and how convincingly it is developed",
  "the balance between the book's achievements and its specific limitations",
  "the book's significance for students, citizens, or law students where the text supports it",
  "the turning points, ending, and what they reveal about the book's deeper meaning",
];
const cleanBookReviewText = (text: string) => text
  .replace(/\[(?:S\d+|source\s*\d+)\]/gi, "")
  .replace(/\bS\d+\b/g, "")
  .replace(/^#{1,6}\s+/gm, "")
  .replace(/\*\*/g, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

export default function AssignmentHelperPage({ assignments, learnerLevel = "" }: { assignments: Assignment[]; learnerLevel?: string }) {
  const [sources, setSources] = useState<SourceChoice[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [tool, setTool] = useState<Tool>(tools[0]);
  const [result, setResult] = useState<AIResult | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [importingSource, setImportingSource] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | "library" | "my">("all");
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [searchingSources, setSearchingSources] = useState(false);

  const librarySources = useMemo(() => sources.filter((source) => (source.kind === "document" || source.kind === "material") && (source.scope !== "library" || materialVisibleToLevel(source.target_years, learnerLevel))), [sources, learnerLevel]);
  const selectedSources = librarySources.filter((source) => source.kind === "document" && selected.includes(source.id));
  const visibleSources = useMemo(() => { const query = sourceSearch.trim().toLowerCase(); return librarySources.filter((source) => (sourceFilter === "all" || (sourceFilter === "library" ? source.scope === "library" : source.scope !== "library")) && (!query || `${source.title} ${source.citation || ""}`.toLowerCase().includes(query))); }, [librarySources, sourceFilter, sourceSearch]);
  const compactSources = useMemo(() => {
    if (sourcesExpanded || visibleSources.length <= 8) return visibleSources;
    const selectedVisible = visibleSources.filter((source) => source.kind === "document" && selected.includes(source.id));
    return [...selectedVisible, ...visibleSources.filter((source) => !selected.includes(source.id)).slice(0, Math.max(0, 8 - selectedVisible.length))];
  }, [selected, sourcesExpanded, visibleSources]);
  const selectedIds = selectedSources.map((source) => source.id);
  const groundingMode = selectedSources.length > 0 && selectedSources.every((source) => source.scope === "library") ? "library" : selectedSources.some((source) => source.scope === "library") ? "auto" : "materials";
  const isBookReview = tool.id === "book-review";
  // Imported Library books are saved as readable user documents, so scope is
  // not reliable after preparation. Book-review mode intentionally uses the
  // one selected readable source instead of rejecting it as "not a Library book".
  const selectedBook = isBookReview ? selectedSources[0] ?? null : null;

  const importSource = async (source: SourceChoice) => {
    if (source.kind !== "material" || !source.url || importingSource) return;
    setImportingSource(source.id); setNotice(`Preparing ${source.title} for the assignment helper…`);
    try {
      const imported = await importLibraryMaterial({ title: source.title, url: source.url, citation: source.citation, target_years: source.target_years ?? [] });
      await loadSources();
      setSelected((current) => isBookReview ? [imported.id] : [...current, imported.id]);
      setNotice(`${source.title} is now AI-readable and selected.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not prepare that Library book."); }
    finally { setImportingSource(null); }
  };
  const loadSources = async (search = "") => {
    setSearchingSources(Boolean(search.trim()));
    try {
      const available = await listGuideSources(search);
      setSources(available);
      setNotice(available.length ? (search.trim() ? `Found ${available.length} matching source${available.length === 1 ? "" : "s"}.` : "Choose AI-readable documents or click a Library book to prepare its text for the helper.") : "No matching Library source was found. Try the title, author, or clear the search.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load your saved sources.");
    } finally { setSearchingSources(false); }
  };
  useEffect(() => { void loadSources(); }, []);

  const run = async () => {
    const requestedBrief = isBookReview
      ? (brief.trim() ? `Optional book-review instructions: ${brief.trim()}` : "Write the complete official book review from the selected Library book.")
      : brief.trim();
    if (!requestedBrief) { setNotice("Paste the assignment question or brief first."); return; }
    if (isBookReview && !selectedBook) { setNotice("Choose one Library book first. If it is not AI-readable yet, click it once to prepare the book text."); return; }
    setBusy(true); setResult(null); setNotice("The assignment helper is working from your brief and selected sources…");
    let previousReviews: { review_text: string }[] = [];
    if (isBookReview && supabase && selectedBook) {
      const previous = await supabase.from("book_reviews").select("review_text").eq("book_key", selectedBook.id).order("created_at", { ascending: false }).limit(8);
      previousReviews = (previous.data ?? []) as { review_text: string }[];
    }
    const reviewAngle = reviewAngles[(previousReviews.length + Math.floor(Math.random() * reviewAngles.length)) % reviewAngles.length];
    const context = [
      `Assignment title: ${(isBookReview ? selectedBook?.title : title) || title || "Untitled assignment"}`,
      `Assignment brief/question:\n${requestedBrief}`,
      selectedSources.length ? `Selected AI-readable source documents:\n${selectedSources.map((source) => `- ${source.title}${source.citation ? ` (${source.citation})` : ""}`).join("\n")}` : "",
      draft.trim() ? `Student draft or working notes:\n${draft.trim()}` : "No draft supplied yet.",
      isBookReview ? `WRITE THE COMPLETE BOOK REVIEW NOW USING THIS EXACT PLAIN-TEXT STRUCTURE. Do not use Markdown, bullets, numbered headings, tables, emojis, decorative separators, citations in brackets, or any introductory or closing note outside this structure. Start with this exact title on its own line: BOOK REVIEW. Then write these metadata lines in this exact order, one per line: Title: [book title]; Author: [author]; Publisher: [publisher]; Year of Publication: [year]; Price: [price]; Pages: [number]; Availability: [availability]; Reviewer: ${reviewer.trim() || "[Reviewer name not supplied]"}. Then write the review as ordinary paragraphs only, with no section headings. Cover the setting and subject, main events or argument, important themes and writing techniques, strengths and weaknesses, relevance to law students where genuinely relevant, and a concluding assessment. Extract metadata only when supported by the book text or Library record. For missing metadata write [Not stated — verify] rather than inventing it. Do not repeat generic praise, paragraphs, or sentences. Make the review specific, balanced, official in tone, and source-grounded. This is a book review, not a plot-only summary and not an assignment answer.

ORIGINALITY AND MEANINGFULNESS: Build this review around the primary critical angle of ${reviewAngle}, but use that angle only where the book evidence supports it; never force it or invent details. Make every body paragraph do useful work: identify a specific event, character, image, argument, technique, or passage-level pattern from the processed book, explain its significance, and connect it to the overall judgment. Include fair, concrete criticism rather than generic praise. Avoid stock openings, empty adjectives, repeated metaphors, predictable paragraph templates, and wording that resembles previous reviews. A different angle is valuable only when it produces a defensible, book-specific interpretation.` : "",
      isBookReview && previousReviews.length ? `PREVIOUS REVIEWS OF THIS SAME BOOK (use them only to avoid repeating their wording and angle; do not quote or reproduce them):\n${previousReviews.slice(0, 5).map((item, index) => `Review ${index + 1}: ${item.review_text.slice(0, 3500)}`).join("\n\n")}` : "",
      tool.feature === "rw_outline" ? "Include a practical section-by-section outline, thesis options, counterargument, and approximate word counts." : "",
      tool.feature === "irac" ? "Do not write the final answer. Produce a study-ready IRAC plan tied to the facts." : "",
      tool.feature === "rw_critique" ? "Give specific improvements and preserve the student's own voice; do not fabricate authorities." : "",
      "Use only retrieved AI-readable source text for source-specific legal claims. Never invent authorities or citations.",
    ].filter(Boolean).join("\n\n");
    try {
      let response: AIResult;
      if (isBookReview && selectedBook) {
        const totalSections = await countMaterialChunks(selectedBook.id);
        const plan = planBookSummary(totalSections);
        const completed: { plan: (typeof plan)[number]; result: AIResult }[] = [];
        for (const part of plan) {
          setNotice(`Reading the complete book: indexed sections ${part.startSection}–${part.endSection} of ${totalSections}…`);
          const parts = await requestBookSummaryPart(
            `Prepare concise but information-dense evidence for an eventual book review. Preserve important events, characters, arguments, themes, writing techniques, strengths, weaknesses, turning points, qualifications and conclusions from this range. Do not use outside knowledge. The final review must not claim details that are absent from these ordered notes.`,
            part,
            selectedBook.id,
            groundingMode,
            askAI,
          );
          completed.push(...parts);
        }
        const orderedEvidence = completed.map(({ plan: part, result: partResult }) => {
          const notes = partResult.answer.replace(/^>[^\n]*\n?/m, "").trim().slice(0, 1400);
          return `[Indexed sections ${part.startSection}–${part.endSection}] ${extractBookPartRecap(partResult.answer)}\nDetailed evidence: ${notes}`;
        }).join("\n\n");
        const synthesisPrompt = `${context}\n\nFULL-BOOK COVERAGE REQUIREMENT: The ordered evidence below was created by processing every readable indexed section of the selected book. Use all of it. Do not omit important events, arguments, themes, character changes, qualifications, weaknesses or conclusions merely because they appear late in the book.\n\nMEANINGFUL ORIGINALITY REQUIREMENT: Build this review around the critical angle of ${reviewAngle}. Use a specific book detail in each body paragraph, explain why it matters, and give a balanced judgment with concrete strengths and limitations. Do not copy phrases, sentence shapes, paragraph order, or distinctive interpretations from previous reviews. Do not add detail unless it appears in the ordered evidence.\n\nORDERED FULL-BOOK EVIDENCE:\n${orderedEvidence}\n\nNow write the final review in the exact plain-text structure requested above. Do not include source markers such as [S1] or [S2].`;
        response = await askAI({ feature: "book_review_synthesis", mode: "general", messages: [{ role: "user", content: synthesisPrompt }] });
        response = { ...response, answer: cleanBookReviewText(response.answer), grounded: true, warnings: [...response.warnings, `All ${totalSections} readable indexed sections were processed in ${completed.length} ordered batches before synthesis.`] };
        if (previousReviews.some((item) => reviewKey(item.review_text) === reviewKey(response.answer))) {
          response = { ...response, answer: cleanBookReviewText((await askAI({ feature: "book_review_synthesis", mode: "general", messages: [{ role: "user", content: `${synthesisPrompt}\n\nThis draft is too similar to an earlier review. Rewrite it with a materially different structure, critical angle, examples and wording while retaining all supported book details. Do not reuse distinctive phrases.` }] })).answer) };
        }
      } else {
        const requestReview = (extra = "") => askAI({ feature: tool.feature, mode: selectedIds.length ? groundingMode : "general", docIds: selectedIds, messages: [{ role: "user", content: `${context}${extra}` }] });
        response = await requestReview();
      }
      if (isBookReview) response = { ...response, answer: cleanBookReviewText(response.answer) };
      if (isBookReview && supabase && selectedBook) {
        const { data: auth } = await supabase.auth.getUser();
        if (auth.user) {
          const saved = await supabase.from("book_reviews").insert({ book_key: selectedBook.id, book_title: selectedBook.title, review_text: response.answer, content_fingerprint: reviewKey(response.answer), created_by: auth.user.id });
          if (saved.error && saved.error.code !== "23505") throw new Error(`Review generated but could not be recorded for duplicate protection: ${saved.error.message}`);
        }
      }
      setResult(response); setNotice(response.grounded ? "Done. Case citations are tied to retrieved source text; use Kenya Law Case Finder for authorities not included there." : selectedSources.length ? "Done. No readable text was returned from the selected documents, so this is a general overview. Re-upload the source or use Kenya Law Case Finder." : "Done. This is a general overview; no source text was selected. Library reference links do not supply text to the helper.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The assignment helper could not complete this request.");
    } finally { setBusy(false); }
  };

  const resultTitle = isBookReview ? `Book review — ${selectedBook?.title || title || "Library book"}` : (title || "Assignment helper");
  const exportOptions = { plainBookReview: isBookReview, eyebrow: isBookReview ? "Group 13 · Library book review" : "Group 13 · Assignment helper", subtitle: isBookReview ? (selectedBook?.title || "Official book review") : title || "Study notes", sources: selectedSources.map((source) => source.title) };
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
        <label>{isBookReview ? "Review instructions (optional)" : "Assignment question or brief"}<textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={8} placeholder={isBookReview ? "Optional: ask for a particular length or critical angle. The official review format is applied automatically." : "Paste the exact question, instructions, word count, deadline, and marking rubric if you have them."} /></label>
        <label>Draft or working notes <span className="field-hint">Optional for question analysis; useful for review.</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={8} placeholder="Paste your introduction, outline, argument, or draft here." /></label>
        {isBookReview && <label>Reviewer name<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="e.g. Jane Wanjiku" /><span className="field-hint">This is placed in the review's bibliographic details. Missing book metadata is marked for verification rather than invented.</span></label>}
        <div className="section-label">2. Choose what you want written</div>
        <div className="assignment-tools">{tools.map((item) => <button type="button" key={item.id} className={`assignment-tool ${tool.id === item.id ? "active" : ""}`} onClick={() => setTool(item)}><Lightbulb size={15} /><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>
        <div className="section-label">3. Choose source text</div>
        <p className="field-hint assignment-source-help">{isBookReview ? "Choose one Library book. If it is not AI-readable yet, click it once to prepare the text; the review is recorded to prevent repeated wording for future users." : "Choose AI-readable books and documents to ground the helper. The list is scrollable so a large Library will not make the page longer."}</p>
        <div className="assignment-source-toolbar" role="group" aria-label="Filter assignment sources">
          <span className="field-hint">{selectedSources.length} source{selectedSources.length === 1 ? "" : "s"} selected</span>
          <div className="assignment-source-filters">
            <button type="button" className={sourceFilter === "all" ? "active" : ""} onClick={() => setSourceFilter("all")}>All</button>
            <button type="button" className={sourceFilter === "library" ? "active" : ""} onClick={() => setSourceFilter("library")}>Library books</button>
            <button type="button" className={sourceFilter === "my" ? "active" : ""} onClick={() => setSourceFilter("my")}>My uploads</button>
          </div>
        </div>
        <form className="assignment-source-search" onSubmit={(event) => { event.preventDefault(); setSourcesExpanded(true); void loadSources(sourceSearch); }}><Search size={14} /><input value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="Search the full Library by title or author…" aria-label="Search the full Library" /><button type="submit" className="secondary-button" disabled={searchingSources}>{searchingSources ? "Searching…" : "Search"}</button></form>
        <div className="assignment-sources">{visibleSources.length ? compactSources.map((source) => <label className={`assignment-source ${source.kind !== "document" ? "reference-only" : ""}`} key={`${source.kind}:${source.id}`}><input type="checkbox" checked={source.kind === "document" && selected.includes(source.id)} disabled={source.kind === "material" && importingSource === source.id} onChange={() => source.kind === "material" ? void importSource(source) : setSelected((current) => isBookReview ? [source.id] : current.includes(source.id) ? current.filter((id) => id !== source.id) : [...current, source.id])} /><BookOpen size={14} /><span>{source.title}<small>{source.kind === "material" ? (importingSource === source.id ? "Preparing Library book for AI…" : "Library book · click to add readable text") : source.scope === "library" ? "Library book · text supplied to AI" : "My saved document · text supplied to AI"}{source.citation ? ` · ${source.citation}` : ""}</small></span></label>) : <p className="empty">No sources in this filter. Add source text in Library, then refresh.</p>}</div>
        {visibleSources.length > 8 && <button type="button" className="assignment-source-more" onClick={() => setSourcesExpanded((expanded) => !expanded)}>{sourcesExpanded ? "Show fewer sources" : `Show all ${visibleSources.length} sources`}</button>}
        <div className="assignment-actions"><button className="secondary-button" onClick={() => void loadSources()}><RefreshCw size={13} /> Refresh sources</button><button className="primary-button" onClick={() => void run()} disabled={busy || (!brief.trim() && !isBookReview)}><Sparkles size={14} /> {busy ? "Writing…" : isBookReview ? "Write the book review" : tool.label}</button></div>
      </div>
      <div className="card card-pad assignment-helper-result"><div className="assignment-result-head"><div className="section-label">{isBookReview ? "Official book review" : "Your tutor's response"}</div>{result && <div className="export-actions"><button className="secondary-button small-action" onClick={() => downloadWord(resultTitle, result.answer, isBookReview ? "book-review.docx" : "assignment-helper.docx", exportOptions)}><Download size={13} /> Word</button><button className="secondary-button small-action" onClick={() => downloadPdf(resultTitle, result.answer, isBookReview ? "book-review.pdf" : "assignment-helper.pdf", exportOptions)}><Download size={13} /> PDF</button></div>}</div>{result ? <><div className="assignment-result-meta"><CheckCircle2 size={15} /> {isBookReview ? "Official review grounded in the selected Library book" : result.grounded ? "Grounded in selected sources" : "General legal overview"}{assignmentId ? ` · Linked to ${assignments.find((assignment) => assignment.id === assignmentId)?.title ?? "assignment"}` : ""}</div>{isBookReview ? <pre className="assignment-book-review-plain">{result.answer}</pre> : <Markdown text={result.answer} />}<StorytellButton title={resultTitle} source={result.answer} />{result.warnings.length > 0 && <div className="assignment-warnings"><strong>Source note</strong>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}</> : <div className="assignment-empty"><Sparkles size={28} /><h2>{isBookReview ? "Choose a Library book" : "Start with the question"}</h2><p>{isBookReview ? "Select one Library book above, then generate an official review with metadata, critical evaluation and download options." : "Choose an assignment or paste the question, then select the AI-readable source text to ground your work."}</p></div>}</div>
    </div>
  </section>;
}
