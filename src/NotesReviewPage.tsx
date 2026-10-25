import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  Loader2,
  RotateCcw,
  Search,
  Share2,
  Upload,
} from "lucide-react";
import { supabase } from "./data/repository";
import type { Material, Unit } from "./data/types";
import { askAI, deleteMaterial, extractText, saveTextMaterial } from "./lib/ai";
import {
  extractOfficialCitation,
  mergeResearchPlans,
  normalizeNotesReview,
  normalizeResearchPlan,
  joinReviewedNoteParts,
  notesResearchPrompt,
  notesReviewPrompt,
  safeKenyaLawUrl,
  uniqueOfficialSources,
  type NotesReviewResult,
  type NotesResearchPlan,
  type OfficialResearchSource,
} from "./lib/notesReview";
import { fetchKenyaLawCase } from "./lib/kenyaLaw";
import "./notes-review.css";

type SavedReview = {
  id: string;
  title: string;
  review: NotesReviewResult;
  research_sources: Omit<OfficialResearchSource, "text">[];
  created_at: string;
};
type Props = {
  userId: string | null;
  units: Unit[];
  initialText?: string;
  initialTitle?: string;
  onShareToLibrary: (file: File, title: string, unit: string) => Promise<Material>;
};

const MAX_RESEARCH_QUERIES = 8;
const MAX_OPENED_AUTHORITIES = 6;
const HISTORY_LIMIT = 25;
const REVIEW_SECTIONS_PER_PART = 6;
const MAX_REVIEW_PARTS = 30;

function parsePlan(value: unknown, answer: string) {
  if (value && typeof value === "object") return normalizeResearchPlan(value);
  try {
    const parsed = JSON.parse(answer.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return normalizeResearchPlan(parsed);
  } catch {
    return normalizeResearchPlan(null);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function savedSourceView(sources: Omit<OfficialResearchSource, "text">[]): OfficialResearchSource[] {
  return sources.map((source) => ({ ...source, text: "" }));
}

export default function NotesReviewPage({ userId, units, initialText, initialTitle, onShareToLibrary }: Props) {
  const [title, setTitle] = useState("My law notes");
  const [notes, setNotes] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<NotesReviewResult | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [sources, setSources] = useState<OfficialResearchSource[]>([]);
  const [history, setHistory] = useState<SavedReview[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<{ title: string; original: string; review: NotesReviewResult; sources: Omit<OfficialResearchSource, "text">[] } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const seedKey = useRef("");
  const canReview = Boolean(userId && notes.trim().length >= 80 && !busy);

  useEffect(() => {
    const text = initialText?.trim();
    if (!text) return;
    const key = `${initialTitle ?? ""}\u0000${text}`;
    if (seedKey.current === key) return;
    seedKey.current = key;
    setNotes(text);
    setTitle(initialTitle?.trim() || "Transcript notes");
    setReview(null);
    setSources([]);
    setError("");
    setSaveMessage("");
  }, [initialText, initialTitle]);

  const loadHistory = useCallback(async () => {
    if (!supabase || !userId) {
      setHistory([]);
      return;
    }
    setHistoryBusy(true);
    const { data, error: loadError } = await supabase
      .from("notes_reviews")
      .select("id,title,review,research_sources,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (!loadError && data) setHistory(data as unknown as SavedReview[]);
    setHistoryBusy(false);
  }, [userId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const addFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setFileMessage("Extracting your notes…");
    setError("");
    try {
      const extracted = (await extractText(file)).trim();
      if (!extracted) throw new Error("No readable text was found. Try a text-based PDF or DOCX, or paste the notes directly.");
      setNotes(extracted);
      setTitle(file.name.replace(/\.[^.]+$/, "").trim() || "Uploaded law notes");
      setReview(null);
      setSources([]);
      setFileMessage(`${file.name} is ready to review (${extracted.length.toLocaleString()} characters).`);
    } catch (cause) {
      setFileMessage("");
      setError(cause instanceof Error ? cause.message : "The selected file could not be read.");
    }
  };

  const saveToHistory = async (record = pendingRecord) => {
    if (!supabase || !userId || (!record && !(activeReviewId && reviewDirty && review))) {
      setSaveMessage(!userId ? "Sign in to save a private review history." : "There are no pending review changes to save.");
      return;
    }
    setSaving(true);
    setSaveMessage("");
    if (!record && activeReviewId && reviewDirty && review) {
      const { error: updateError } = await supabase
        .from("notes_reviews")
        .update({ review })
        .eq("id", activeReviewId)
        .eq("user_id", userId)
        .select("id")
        .single();
      if (updateError) {
        setSaveMessage(`Could not save your note edits: ${updateError.message}`);
        setSaving(false);
        return;
      }
      setHistory((current) => current.map((item) => item.id === activeReviewId ? { ...item, review } : item));
      setReviewDirty(false);
      setSaveMessage("Your edited corrected notes are saved to private history.");
      setSaving(false);
      return;
    }
    if (!record) {
      setSaveMessage("There is no pending review to save.");
      setSaving(false);
      return;
    }
    const { data, error: saveError } = await supabase
      .from("notes_reviews")
      .insert({
        user_id: userId,
        title: record.title.slice(0, 200),
        original_text: record.original,
        review: record.review,
        research_sources: record.sources,
      })
      .select("id,title,review,research_sources,created_at")
      .single();
    if (saveError || !data) {
      setSaveMessage(`Review completed but not saved to history: ${saveError?.message ?? "database did not confirm the save"}. Use Retry save.`);
      setSaving(false);
      return;
    }
    setHistory((current) => [data as unknown as SavedReview, ...current.filter((item) => item.id !== data.id)].slice(0, HISTORY_LIMIT));
    setPendingRecord(null);
    setActiveReviewId(data.id);
    setReviewDirty(false);
    setSaveMessage("Saved privately to your review history.");
    setSaving(false);
  };

  const runReview = async () => {
    if (!userId) {
      setError("Sign in to run and save a private notes review.");
      return;
    }
    const original = notes.trim();
    if (original.length < 80) {
      setError("Add at least a paragraph of notes so the review has enough legal context.");
      return;
    }
    if (!supabase) {
      setError("Supabase is not configured, so official research and private history are unavailable.");
      return;
    }
    const client = supabase;
    setBusy(true);
    setError("");
    setReview(null);
    setSources([]);
    setSaveMessage("");
    setShareMessage("");
    let documentId: string | null = null;
    try {
      setStage("Indexing the complete note for source-based review");
      const indexed = await saveTextMaterial(`Private review source ${crypto.randomUUID()}`, original);
      documentId = indexed.id;
      const totalParts = Math.max(1, Math.ceil(indexed.chunks / REVIEW_SECTIONS_PER_PART));
      if (totalParts > MAX_REVIEW_PARTS) {
        throw new Error(`These notes contain ${indexed.chunks} indexed sections. A complete review supports up to ${MAX_REVIEW_PARTS * REVIEW_SECTIONS_PER_PART}; split the notes into smaller documents and retry. Nothing was sampled.`);
      }

      const researchPlans: NotesResearchPlan[] = [];
      for (let part = 0; part < totalParts; part++) {
        setStage(`Identifying authorities · reading notes section ${part + 1} of ${totalParts}`);
        const planResponse = await askAI({
          feature: "notes_research",
          mode: "materials",
          docIds: [indexed.id],
          part,
          size: REVIEW_SECTIONS_PER_PART,
          messages: [{ role: "user", content: notesResearchPrompt({ part, total: totalParts }) }],
        });
        researchPlans.push(parsePlan(planResponse.data, planResponse.answer));
      }
      const plan = mergeResearchPlans(researchPlans);
      const queries = plan.searchQueries.slice(0, MAX_RESEARCH_QUERIES);
      const searchStatus: string[] = [];
      const candidates: { title: string; url: string }[] = [];
      if (queries.length) {
        setStage(`Searching official Kenya Law for ${queries.length} cited authorities and issues`);
        const lookups = await Promise.all(queries.map(async (query) => {
          const { data, error: searchError } = await client.functions.invoke("kenya-law-search", { body: { query } });
          if (searchError) {
            searchStatus.push(`${query}: search failed`);
            return;
          }
          const payload = asRecord(data);
          const rows = Array.isArray(payload?.results) ? payload.results : [];
          const queryMatches = rows.map((item) => {
            const row = asRecord(item) ?? {};
            const url = safeKenyaLawUrl(row.url);
            if (!url) return null;
            return { title: String(row.title ?? "Kenya Law result"), url };
          }).filter((item): item is { title: string; url: string } => Boolean(item));
          if (!queryMatches.length) searchStatus.push(`${query}: no official record returned`);
          return queryMatches.slice(0, 2);
        }));
        for (const set of lookups) if (set) candidates.push(...set);
      } else {
        searchStatus.push("No research query could be safely extracted from the note.");
      }
      const uniqueCandidates = [...new Map(candidates.map((item) => [item.url, item])).values()].slice(0, MAX_OPENED_AUTHORITIES);
      const opened = await Promise.all(uniqueCandidates.map(async (candidate) => {
        try {
          const document = await fetchKenyaLawCase(candidate.url);
          return {
            id: "",
            title: document.title || candidate.title,
            url: safeKenyaLawUrl(document.url) ?? candidate.url,
            citation: extractOfficialCitation(document.title || candidate.title, document.text),
            text: document.text.slice(0, 4500),
          } satisfies OfficialResearchSource;
        } catch {
          searchStatus.push(`${candidate.title}: official document could not be opened/read`);
          return null;
        }
      }));
      const verifiedSources = uniqueOfficialSources(opened.filter((item): item is OfficialResearchSource => Boolean(item)));
      setSources(verifiedSources);

      const safeIds = new Set(verifiedSources.map((item) => item.id));
      const reviewedParts: NotesReviewResult[] = [];
      let precedingTail = "";
      for (let part = 0; part < totalParts; part++) {
        setStage(`${verifiedSources.length ? `Checking against ${verifiedSources.length} official source${verifiedSources.length === 1 ? "" : "s"} · ` : "No readable official record · "}reviewing notes section ${part + 1} of ${totalParts}`);
        const result = await askAI({
          feature: "notes_review",
          mode: "materials",
          docIds: [indexed.id],
          part,
          size: REVIEW_SECTIONS_PER_PART,
          messages: [{ role: "user", content: notesReviewPrompt(verifiedSources, { part, total: totalParts, precedingTail }) }],
        });
        const normalizedPart = normalizeNotesReview(result.data, safeIds);
        if (!normalizedPart) throw new Error(`The model did not return complete, readable corrected notes for section ${part + 1} of ${totalParts}. No partial review was saved; retry or upload smaller sections.`);
        reviewedParts.push(normalizedPart);
        precedingTail = normalizedPart.correctedNotes.slice(-700);
      }
      const normalized: NotesReviewResult = {
        status: verifiedSources.length && reviewedParts.every((item) => item.status === "reviewed_with_sources")
          ? "reviewed_with_sources"
          : verifiedSources.length ? "partly_checked" : "needs_review",
        summary: [...new Set(reviewedParts.map((item) => item.summary).filter(Boolean))].join(" ").slice(0, 1200),
        correctedNotes: joinReviewedNoteParts(reviewedParts.map((item) => item.correctedNotes)),
        corrections: [...new Map(reviewedParts.flatMap((item) => item.corrections).map((item) => [`${item.original.toLowerCase()}\u0000${item.corrected.toLowerCase()}`, item])).values()].slice(0, 80),
        authorityChecks: [...new Map(reviewedParts.flatMap((item) => item.authorityChecks).map((item) => [`${item.authority.toLowerCase()}\u0000${item.status}`, item])).values()].slice(0, 40),
        unresolved: [...new Set(reviewedParts.flatMap((item) => item.unresolved))].slice(0, 40),
      };
      if (normalized.correctedNotes.length < 20) throw new Error("The model returned an incomplete corrected note. Your original has not been replaced or saved as reviewed; retry.");
      for (const authority of plan.authorities) {
        if (!normalized.authorityChecks.some((item) => item.authority.toLowerCase() === authority.mention.toLowerCase())) {
          normalized.authorityChecks.push({
            authority: authority.mention,
            status: "not_checked",
            reason: "The research plan identified this authority, but the final review did not return an explicit verification result.",
            sourceIds: [],
          });
        }
      }
      if (searchStatus.length) {
        normalized.unresolved.push(...searchStatus.map((item) => `Research limitation: ${item}`));
      }
      if (verifiedSources.length && (
        searchStatus.length ||
        normalized.authorityChecks.some((item) => item.status !== "verified") ||
        normalized.corrections.some((item) => item.verification === "unverified") ||
        normalized.unresolved.length
      )) normalized.status = "partly_checked";
      setReview(normalized);
      setReviewTitle(title.trim() || "My law notes");
      setActiveReviewId(null);
      setReviewDirty(false);
      setNotes(original);
      const recordSources = verifiedSources.map(({ id, title: sourceTitle, url, citation }) => ({ id, title: sourceTitle, url, citation, text: "" }));
      const record = { title: title.trim() || "My law notes", original, review: normalized, sources: recordSources };
      setPendingRecord(record);
      await saveToHistory(record);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review could not be completed. Your source notes are unchanged.");
    } finally {
      setBusy(false);
      setStage("");
      if (documentId) await deleteMaterial(documentId).catch(() => undefined);
    }
  };

  const openSaved = (item: SavedReview) => {
    setReview(item.review);
    setReviewTitle(item.title);
    setSources(savedSourceView(item.research_sources ?? []));
    setPendingRecord(null);
    setActiveReviewId(item.id);
    setReviewDirty(false);
    setSaveMessage(`Opened saved review from ${new Date(item.created_at).toLocaleString()}.`);
    setShareMessage("");
    setError("");
  };

  const shareToLibrary = async () => {
    if (!review?.correctedNotes.trim()) return;
    setSharing(true);
    setShareMessage("");
    const safeTitle = `${reviewTitle || title} — reviewed notes`.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 160);
    const file = new File([`${review.correctedNotes.trim()}\n`], `${safeTitle}.md`, { type: "text/markdown" });
    try {
      await onShareToLibrary(file, safeTitle, unit || "General law");
      setShareMessage("Library save completed. Check the app banner for AI-indexing status, then open the Library entry and verify the notes before relying on them.");
    } catch (cause) {
      setShareMessage(`Could not add these notes to the shared Library: ${cause instanceof Error ? cause.message : "please retry"}`);
    } finally {
      setSharing(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (review?.status === "reviewed_with_sources") return "Research completed · sources opened";
    if (review?.status === "partly_checked") return "Partially checked · follow-ups remain";
    return "Needs manual verification";
  }, [review?.status]);

  return (
    <div className="notes-review-page">
      <section className="nr-intro">
        <div className="nr-kicker"><Search size={15} /> Research-backed note review</div>
        <h2>Check the notes. Check the law.</h2>
        <p>Paste a transcript or upload your notes. The reviewer checks spelling and meaning, extracts cited authorities, searches Kenya Law, opens available official judgments, and returns an editable corrected version with unresolved points called out.</p>
        <div className="nr-limit"><AlertTriangle size={16} /><span>No AI can guarantee 100% legal accuracy. “Verified” means an official Kenya Law document was opened and supplied to the review—not that the whole note is certified correct. Check important law with your lecturer or the source judgment.</span></div>
      </section>

      <div className="nr-layout">
        <section className="nr-card nr-input-card">
          <div className="nr-section-head"><div><span className="nr-label">01 · YOUR SOURCE</span><h3>Upload or paste notes</h3></div><label className="nr-upload"><Upload size={15} /> Choose file<input type="file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={(event) => void addFile(event)} /></label></div>
          {fileMessage && <p className="nr-inline-status">{fileMessage}</p>}
          <label className="nr-field-label" htmlFor="nr-title">Note title</label>
          <input id="nr-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="e.g. Constitutional law — judicial review" />
          <label className="nr-field-label" htmlFor="nr-source">Original notes <span>{notes.length.toLocaleString()} characters</span></label>
          <textarea id="nr-source" value={notes} onChange={(event) => { setNotes(event.target.value); setReview(null); setSources([]); }} placeholder="Paste your notes here. Keep the wording of case names and citations as recorded so the reviewer can check them." rows={13} />
          <div className="nr-row">
            <label className="nr-field-label" htmlFor="nr-unit">Library unit (only used if you share)</label>
            <select id="nr-unit" value={unit} onChange={(event) => setUnit(event.target.value)}><option value="">General law</option>{units.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
          </div>
          <button className="primary-button nr-run" disabled={!canReview} onClick={() => void runReview()}>{busy ? <><Loader2 size={16} className="nr-spin" /> Reviewing…</> : <><Search size={16} /> Research and review notes</>}</button>
          {stage && <div className="nr-progress" role="status"><Loader2 size={15} className="nr-spin" />{stage}</div>}
          {error && <div className="nr-error" role="alert">{error}</div>}
          {saveMessage && <div className="nr-inline-status" role="status">{saveMessage}</div>}
          {pendingRecord && review && <button className="secondary-button nr-retry-save" disabled={saving} onClick={() => void saveToHistory()}>{saving ? "Saving…" : "Retry save to private history"}</button>}
        </section>

        <aside className="nr-card nr-history-card">
          <div className="nr-section-head"><div><span className="nr-label">PRIVATE TO YOU</span><h3><History size={17} /> Review history</h3></div><button className="nr-icon-button" onClick={() => void loadHistory()} aria-label="Refresh saved review history"><RotateCcw size={15} /></button></div>
          {!userId && <p className="nr-muted">Sign in to save and reopen your reviews.</p>}
          {userId && historyBusy && <p className="nr-muted">Loading your history…</p>}
          {userId && !historyBusy && !history.length && <p className="nr-muted">Your saved reviews will appear here. They are private by default.</p>}
          <div className="nr-history-list">{history.map((item) => <button key={item.id} className="nr-history-item" onClick={() => openSaved(item)}><span><strong>{item.title}</strong><small>{new Date(item.created_at).toLocaleString()}</small></span><FileText size={16} /></button>)}</div>
          <p className="nr-privacy-note">Original input and report are stored under your account. Nothing is sent to the shared Library unless you choose to publish it.</p>
        </aside>
      </div>

      {review && <section className="nr-card nr-results" aria-live="polite">
        <div className="nr-result-head"><div><span className="nr-label">02 · REVIEW RESULT</span><h3>{reviewTitle}</h3></div><span className={`nr-status nr-status-${review.status}`}>{review.status === "reviewed_with_sources" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{statusLabel}</span></div>
        <p className="nr-summary">{review.summary}</p>
        {review.corrections.length > 0 && <div className="nr-table-wrap"><h4>Corrections and legal issues</h4><table className="nr-table"><thead><tr><th>Original</th><th>Suggested correction</th><th>Reason / support</th><th>Check</th></tr></thead><tbody>{review.corrections.map((item, index) => <tr key={`${index}-${item.original}`}><td>{item.original || "—"}</td><td>{item.corrected || "—"}</td><td>{item.reason || item.category}{item.sourceIds.length > 0 && <span className="nr-source-tag">{item.sourceIds.join(", ")}</span>}</td><td>{item.verification === "supported" ? "Source-supported" : item.verification === "unverified" ? "Unverified" : "Language edit"}</td></tr>)}</tbody></table></div>}
        {review.authorityChecks.length > 0 && <div className="nr-authorities"><h4>Authorities checked</h4>{review.authorityChecks.map((item, index) => <div className="nr-authority" key={`${index}-${item.authority}`}><span className={item.status === "verified" ? "nr-check-good" : "nr-check-warn"}>{item.status === "verified" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span><div><strong>{item.authority}</strong><p>{item.reason || item.status}</p>{item.sourceIds.map((id) => { const source = sources.find((candidate) => candidate.id === id); return source ? <a key={id} href={source.url} target="_blank" rel="noopener noreferrer">{id}: {source.title} <ExternalLink size={12} /></a> : null; })}</div><small>{item.status === "verified" ? "Official text opened" : item.status === "not_found" ? "Not found in returned records" : "Not checked against readable full text"}</small></div>)}</div>}
        {sources.length > 0 && <div className="nr-sources"><h4>Official records opened</h4><ul>{sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer"><strong>[{source.id}] {source.title}</strong> <ExternalLink size={12} /></a>{source.citation && <small>{source.citation}</small>}</li>)}</ul></div>}
        {review.unresolved.length > 0 && <div className="nr-unresolved"><h4>Still needs a human check</h4><ul>{review.unresolved.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
        <label className="nr-field-label" htmlFor="nr-corrected">Corrected notes — editable before you share</label>
        <textarea id="nr-corrected" className="nr-corrected" value={review.correctedNotes} onChange={(event) => { setReview((current) => current ? { ...current, correctedNotes: event.target.value } : current); setReviewDirty(true); }} rows={18} />
        {reviewDirty && userId && <button className="secondary-button nr-retry-save" disabled={saving} onClick={() => void saveToHistory(null)}>{saving ? "Saving edits…" : "Save corrected-note edits to private history"}</button>}
        <div className="nr-share-row"><button className="primary-button" disabled={sharing || !review.correctedNotes.trim()} onClick={() => void shareToLibrary()}>{sharing ? <><Loader2 size={15} className="nr-spin" /> Adding…</> : <><Share2 size={15} /> Share corrected notes to Library</>}</button><span>Publishing is optional and shares only the corrected notes—not your original or private audit.</span></div>
        {shareMessage && <div className="nr-inline-status" role="status">{shareMessage}</div>}
        <div className="nr-accuracy-note"><BookOpen size={15} /><span>Research sources are evidence for checking, not a guarantee. Read linked judgments for the full facts, holding, procedural context, and subsequent treatment.</span></div>
      </section>}
    </div>
  );
}
