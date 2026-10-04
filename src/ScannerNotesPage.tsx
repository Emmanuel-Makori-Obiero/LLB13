import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  Download,
  FileImage,
  FileText,
  Languages,
  LoaderCircle,
  Plus,
  Printer,
  ScanLine,
  Search,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import {
  createScannedNote,
  deleteScannedNote,
  listScannedNotes,
  updateScannedNote,
  type ScannedNote,
} from "./lib/scannerNotes";
import "./scanner.css";

const MAX_PAGES = 10;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_BATCH_BYTES = 60 * 1024 * 1024;
const LANGUAGES: Record<string, string[]> = {
  eng: ["eng"],
  swa: ["swa"],
  "eng+swa": ["eng", "swa"],
};

function fileDate() {
  return new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function safeFileBase(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "group-13-study-note";
}

export default function ScannerNotesPage({ userId }: { userId: string | null }) {
  const [notes, setNotes] = useState<ScannedNote[]>([]);
  const [activeNote, setActiveNote] = useState<ScannedNote | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [language, setLanguage] = useState("eng");
  const [search, setSearch] = useState("");
  const [isEditingSaved, setIsEditingSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Preparing OCR…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const ocrWorker = useRef<Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | null>(null);
  const ocrRunId = useRef(0);
  const progressPage = useRef(0);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    let current = true;
    setIsLoading(true);
    void listScannedNotes(userId)
      .then((items) => {
        if (current) setNotes(items);
      })
      .catch((cause: unknown) => {
        if (current)
          setError(cause instanceof Error ? cause.message : "Could not load scan notes.");
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [userId]);

  useEffect(() => () => {
    ocrRunId.current += 1;
    const worker = ocrWorker.current;
    ocrWorker.current = null;
    if (worker) void worker.terminate().catch(() => undefined);
  }, []);

  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file));
    setPreviews(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const visibleNotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return notes;
    return notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(term));
  }, [notes, search]);

  const refreshNotes = async () => {
    if (!userId) return [] as ScannedNote[];
    const latest = await listScannedNotes(userId);
    setNotes(latest);
    return latest;
  };

  const beginNewScan = () => {
    setActiveNote(null);
    setIsEditingSaved(false);
    setFiles([]);
    setDraftText("");
    setDraftTitle("");
    setProgress(0);
    setError("");
    setNotice("");
  };

  const addFiles = (incoming: FileList | File[]) => {
    const batch = Array.from(incoming);
    if (!batch.length) return;
    const invalidType = batch.find((file) => !file.type.startsWith("image/"));
    if (invalidType) {
      setError("Choose image files such as JPEG, PNG or WebP. PDF files are not supported by this scanner.");
      return;
    }
    const oversized = batch.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setError(`${oversized.name} is over the 12 MB per-page limit. Choose a smaller image or reduce its size first.`);
      return;
    }
    const next = [...files, ...batch];
    if (next.length > MAX_PAGES) {
      setError(`A scan can contain up to ${MAX_PAGES} pages. Start another note for additional pages.`);
      return;
    }
    if (next.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) {
      setError("The total scan is over 60 MB. Remove a page or choose smaller images.");
      return;
    }
    setFiles(next);
    setDraftText("");
    setProgress(0);
    setError("");
    setActiveNote(null);
    setIsEditingSaved(false);
    if (!draftTitle.trim()) setDraftTitle(`Scan notes · ${fileDate()}`);
  };

  const removePage = (index: number) => {
    setFiles((current) => current.filter((_, pageIndex) => pageIndex !== index));
    setDraftText("");
    setProgress(0);
  };

  const runOcr = async () => {
    if (!files.length) {
      setError("Add at least one page image before running OCR.");
      return;
    }
    setError("");
    setNotice("");
    setProgress(0);
    setProgressLabel("Loading the local OCR engine…");
    setIsProcessing(true);
    const runId = ++ocrRunId.current;
    let worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(LANGUAGES[language], 1, {
        logger: (message) => {
          if (ocrRunId.current !== runId) return;
          if (message.status) setProgressLabel(message.status.replace(/_/g, " "));
          if (typeof message.progress === "number") {
            const percent = Math.round(((progressPage.current + message.progress) / files.length) * 100);
            setProgress(Math.max(0, Math.min(100, percent)));
          }
        },
      });
      if (ocrRunId.current !== runId) {
        await worker.terminate().catch(() => undefined);
        return;
      }
      ocrWorker.current = worker;
      const pages: string[] = [];
      for (let index = 0; index < files.length; index += 1) {
        progressPage.current = index;
        setProgressLabel(`Reading page ${index + 1} of ${files.length}…`);
        const result = await worker.recognize(files[index]);
        if (ocrRunId.current !== runId) return;
        const text = result.data.text.trim();
        pages.push(`PAGE ${index + 1} — ${files[index].name}\n${text || "[No text detected. You can type the page content below.]"}`);
        setProgress(Math.round(((index + 1) / files.length) * 100));
      }
      if (ocrRunId.current === runId) {
        setDraftText(pages.join("\n\n────────────────────────\n\n"));
        setProgressLabel("Scan ready to review");
        setNotice("Text extracted. Review names, section numbers and legal citations before saving.");
      }
    } catch (cause) {
      if (ocrRunId.current === runId)
        setError(cause instanceof Error ? cause.message : "OCR could not read these images. Try a clearer photo or another language setting.");
    } finally {
      if (worker && ocrRunId.current === runId) {
        ocrWorker.current = null;
        await worker.terminate().catch(() => undefined);
      }
      if (ocrRunId.current === runId) setIsProcessing(false);
    }
  };

  const saveDraft = async () => {
    if (!userId) {
      setError("Sign in to save a private scan note.");
      return;
    }
    if (!draftTitle.trim() || !draftText.trim()) {
      setError("Add a title and review the extracted text before saving.");
      return;
    }
    if (!activeNote && !files.length) {
      setError("A new scan note must include at least one page image.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      if (activeNote && isEditingSaved) {
        await updateScannedNote({
          userId,
          noteId: activeNote.id,
          title: draftTitle,
          body: draftText,
        });
        const latest = await refreshNotes();
        const saved = latest.find((note) => note.id === activeNote.id) ?? null;
        setActiveNote(saved);
        setIsEditingSaved(false);
        setNotice("Note updated.");
      } else {
        const created = await createScannedNote({
          userId,
          title: draftTitle,
          body: draftText,
          files,
        });
        const latest = await refreshNotes();
        setActiveNote(latest.find((note) => note.id === created.id) ?? null);
        setFiles([]);
        setIsEditingSaved(false);
        setNotice("Saved privately to your scan notes.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the note. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const openNote = (note: ScannedNote) => {
    setActiveNote(note);
    setIsEditingSaved(false);
    setFiles([]);
    setDraftTitle(note.title);
    setDraftText(note.body);
    setError("");
    setNotice("");
  };

  const editActiveNote = () => {
    if (!activeNote) return;
    setDraftTitle(activeNote.title);
    setDraftText(activeNote.body);
    setIsEditingSaved(true);
    setNotice("");
  };

  const shareActiveNote = async () => {
    if (!activeNote) return;
    const text = `${activeNote.title}\n\n${activeNote.body}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: activeNote.title, text });
      } else {
        await navigator.clipboard.writeText(text);
        setNotice("Note text copied. Its source-page images remain private.");
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        setNotice("Note text copied. Its source-page images remain private.");
      } catch {
        setError("Sharing is unavailable in this browser. Use Download text instead.");
      }
    }
  };

  const downloadActiveNote = () => {
    if (!activeNote) return;
    const blob = new Blob([`${activeNote.title}\n\n${activeNote.body}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileBase(activeNote.title)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printActiveNote = () => {
    if (!activeNote) return;
    document.body.classList.add("print-scanned-note");
    const cleanup = () => document.body.classList.remove("print-scanned-note");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 30000);
  };

  const removeActiveNote = async () => {
    if (!activeNote || !userId) return;
    if (!window.confirm("Delete this note and its private scanned page images? This cannot be undone.")) return;
    setIsSaving(true);
    setError("");
    try {
      await deleteScannedNote(userId, activeNote.id);
      setActiveNote(null);
      setFiles([]);
      setDraftTitle("");
      setDraftText("");
      await refreshNotes();
      setNotice("Note and its scanned pages were deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the note.");
    } finally {
      setIsSaving(false);
    }
  };

  const showEditor = !activeNote || isEditingSaved;

  return (
    <section className="scan-notes-page">
      <header className="scan-page-heading">
        <div>
          <span className="scan-eyebrow"><ScanLine size={14} /> YOUR PRIVATE READING DESK</span>
          <h1>Scan &amp; notes</h1>
          <p>Turn a page photo into editable study notes. Keep the original scan, then read, share or print from one place.</p>
        </div>
        <a className="scan-guide-link" href="/features">Explore all features <span aria-hidden="true">↗</span></a>
      </header>

      <div className="scan-privacy-note"><span className="scan-privacy-mark"><Check size={14} /></span><span><strong>Your pages stay yours.</strong> OCR runs in this browser. When you save, note text goes to your account and page images go to private storage.</span></div>

      <div className="scan-layout">
        <section className="scan-workspace" aria-label="Create a scan note">
          {activeNote && !isEditingSaved ? (
            <div className="scan-reader">
              <button type="button" className="scan-back-button" onClick={() => setActiveNote(null)}><ChevronLeft size={16} /> All scan notes</button>
              <div className="scan-reader-heading">
                <div><span className="scan-eyebrow"><BookOpen size={13} /> SAVED NOTE</span><h2>{activeNote.title}</h2><p>Updated {new Date(activeNote.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p></div>
                <div className="scan-reader-actions">
                  <button type="button" className="scan-secondary-button" onClick={editActiveNote}>Edit</button>
                  <button type="button" className="scan-secondary-button" onClick={() => void shareActiveNote()}><Share2 size={15} /> Share</button>
                  <button type="button" className="scan-secondary-button" onClick={downloadActiveNote}><Download size={15} /> Text</button>
                  <button type="button" className="scan-primary-button" onClick={printActiveNote}><Printer size={15} /> Print / PDF</button>
                  <button type="button" className="scan-danger-button" onClick={() => void removeActiveNote()} disabled={isSaving} aria-label="Delete note and its scan pages"><Trash2 size={15} /></button>
                </div>
              </div>
              <article className="scan-print-area">
                <h1>{activeNote.title}</h1>
                <p className="scan-print-date">Group 13 · Scan notes · {new Date(activeNote.updated_at).toLocaleDateString("en-GB")}</p>
                <div className="scan-note-body">{activeNote.body}</div>
                {activeNote.pages.length > 0 && <section className="scan-original-pages"><h3>Original scanned pages</h3><div className="scan-page-images">{activeNote.pages.map((page) => <figure key={page.id}>{page.signedUrl ? <img src={page.signedUrl} alt={`Scanned page ${page.pageNumber}`} /> : <div className="scan-page-unavailable"><FileImage size={22} /> Preview unavailable</div>}<figcaption>Page {page.pageNumber || "—"} · {page.originalName}</figcaption></figure>)}</div></section>}
              </article>
            </div>
          ) : (
            <>
              <div className="scan-editor-heading">
                <div><span className="scan-eyebrow"><FileText size={13} /> {isEditingSaved ? "EDIT NOTE" : "NEW SCAN"}</span><h2>{isEditingSaved ? "Refine the text." : "Bring the page in."}</h2><p>Photograph a handout or select page images. The text stays editable after scanning.</p></div>
                {(files.length > 0 || isEditingSaved) && <button type="button" className="scan-text-button" onClick={beginNewScan} disabled={isProcessing}><Plus size={15} /> New scan</button>}
              </div>

              {!isEditingSaved && (
                <>
                  <div className="scan-toolbar">
                    <label className="scan-language-label"><Languages size={15} /><span>Text language</span><select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={isProcessing}><option value="eng">English</option><option value="swa">Kiswahili</option><option value="eng+swa">English + Kiswahili</option></select></label>
                    <span className="scan-page-limit">{files.length}/{MAX_PAGES} pages · up to 12 MB each</span>
                  </div>

                  <div className="scan-upload-row">
                    <button type="button" className="scan-primary-button" onClick={() => fileInput.current?.click()} disabled={isProcessing || files.length >= MAX_PAGES}><Upload size={16} /> Choose or photograph pages</button>
                    <input ref={fileInput} className="scan-file-input" type="file" accept="image/*" capture="environment" multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ""; }} />
                    <span>JPEG, PNG or WebP images · up to 10 pages per note</span>
                  </div>

                  {files.length > 0 && <div className="scan-page-queue" aria-label="Pages selected for scanning">{files.map((file, index) => <figure key={`${file.name}-${index}`} className="scan-page-thumb"><img src={previews[index]} alt={`Selected page ${index + 1}`} /><figcaption><span>PAGE {index + 1}</span><span>{file.name}</span></figcaption><button type="button" onClick={() => removePage(index)} aria-label={`Remove page ${index + 1}`}><Trash2 size={13} /></button></figure>)}</div>}

                  <div className="scan-ocr-actions">
                    <button type="button" className="scan-primary-button" onClick={() => void runOcr()} disabled={isProcessing || !files.length}><ScanLine size={16} /> {isProcessing ? "Reading pages…" : "Extract text"}</button>
                    {files.length > 0 && <button type="button" className="scan-text-button" onClick={() => { setFiles([]); setDraftText(""); setProgress(0); setError(""); }} disabled={isProcessing}>Clear pages</button>}
                  </div>
                  {isProcessing && <div className="scan-progress" role="status"><div className="scan-progress-label"><span>{progressLabel}</span><strong>{progress}%</strong></div><progress max="100" value={progress}>{progress}%</progress><small>The first run may download language data to this browser. Later pages reuse the same OCR worker.</small></div>}
                </>
              )}

              {(files.length > 0 || isEditingSaved || draftText) && (
                <div className="scan-note-editor">
                  <label className="scan-field-label">Note title<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={120} placeholder="e.g. Constitutional law — lecture notes" /></label>
                  <label className="scan-field-label">Recognized text<textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} rows={14} placeholder="Extracted text will appear here. You can also type or correct it by hand." /></label>
                  <div className="scan-editor-footer"><span>OCR can misread names, section numbers and case citations. Check against the original page.</span><button type="button" className="scan-primary-button" onClick={() => void saveDraft()} disabled={isSaving || !draftText.trim()}>{isSaving ? <LoaderCircle size={15} className="scan-spin" /> : <Check size={15} />} {isSaving ? "Saving…" : isEditingSaved ? "Save changes" : "Save privately"}</button></div>
                </div>
              )}
            </>
          )}

          {error && <div className="scan-message scan-error" role="alert">{error}</div>}
          {notice && <div className="scan-message scan-success" role="status">{notice}</div>}
        </section>

        <aside className="scan-notes-sidebar" aria-label="Saved scan notes">
          <div className="scan-notes-heading"><div><span className="scan-eyebrow">YOUR NOTEBOOK</span><h2>Saved scans</h2></div><span className="scan-note-count">{notes.length}</span></div>
          <label className="scan-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a note" aria-label="Search saved scan notes" /></label>
          {isLoading ? <p className="scan-empty-note">Loading your notes…</p> : visibleNotes.length ? <div className="scan-saved-list">{visibleNotes.map((note) => <button type="button" key={note.id} className={`scan-saved-note${activeNote?.id === note.id ? " active" : ""}`} onClick={() => openNote(note)}><span className="scan-saved-date">{new Date(note.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span><strong>{note.title}</strong><small>{note.body.slice(0, 110).replace(/\s+/g, " ")}{note.body.length > 110 ? "…" : ""}</small><span className="scan-saved-meta"><FileImage size={12} /> {note.pages.length} {note.pages.length === 1 ? "page" : "pages"}</span></button>)}</div> : <div className="scan-empty"><FileText size={20} /><strong>{search ? "No matching notes" : "Your notebook is empty"}</strong><span>{search ? "Try another search." : "Your saved scans will appear here, ready to reopen and print."}</span></div>}
          {!isLoading && notes.length > 0 && <p className="scan-share-note">Share sends note text only. Original scan images remain private to your account.</p>}
        </aside>
      </div>
    </section>
  );
}
