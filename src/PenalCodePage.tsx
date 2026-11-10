import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Bookmark, BookOpen, Download, Search, ScrollText } from "lucide-react";
import penalCode from "./data/penal-code-2023.json";
import "./penal-code.css";

type PenalCodeSection = {
  id: string;
  number: string;
  title: string;
  part: string;
  division: string;
  chapter: string;
  text: string;
};

type PenalCodeSource = {
  title: string;
  citation: string;
  edition: string;
  assented: string;
  commenced: string;
  source: string;
  sourceUrl: string;
  pdfUrl: string;
  indexEdition: string;
  indexSourceUrl: string;
  license: string;
  frontMatter: string;
  sections: PenalCodeSection[];
  indexText: string;
  sectionCount: number;
  pageCount: number;
};

const source = penalCode as PenalCodeSource;
const storageKey = "llb13-penal-code-bookmarks-v1";
const loadBookmarks = (): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
};

export default function PenalCodePage() {
  const [selectedId, setSelectedId] = useState("section-1");
  const [query, setQuery] = useState("");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [saved, setSaved] = useState<string[]>(loadBookmarks);
  const [savedOnly, setSavedOnly] = useState(false);
  const readerRef = useRef<HTMLElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const selectedSection = source.sections.find((section) => section.id === selectedId) ?? null;
  const chapters = useMemo(() => [...new Set(source.sections.map((section) => section.chapter))], []);
  const matchingSections = useMemo(() => source.sections.filter((section) => {
    if (savedOnly && !saved.includes(section.id)) return false;
    if (chapterFilter !== "all" && section.chapter !== chapterFilter) return false;
    if (!normalizedQuery) return true;
    return `${section.number} ${section.title} ${section.part} ${section.division} ${section.chapter} ${section.text}`.toLocaleLowerCase().includes(normalizedQuery);
  }), [chapterFilter, normalizedQuery, saved, savedOnly]);
  const frontMatterMatches = Boolean(normalizedQuery && source.frontMatter.toLocaleLowerCase().includes(normalizedQuery));
  const indexMatches = Boolean(normalizedQuery && source.indexText.toLocaleLowerCase().includes(normalizedQuery));

  const selectContent = (id: string) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 820px)").matches) {
      window.setTimeout(() => readerRef.current?.scrollIntoView({ block: "start" }), 0);
    }
  };

  const toggleSaved = (id: string) => {
    const next = saved.includes(id) ? saved.filter((value) => value !== id) : [...saved, id].sort();
    setSaved(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the current reading session usable. */ }
  };

  const selectedSpecial = selectedId === "front-matter" || selectedId === "index";
  const selectedTitle = selectedId === "front-matter"
    ? "Preface, edition record & contents"
    : selectedId === "index"
      ? "Alphabetical index"
      : selectedSection
        ? `Section ${selectedSection.number}. ${selectedSection.title}`
        : "Penal Code";

  return (
    <div className="penal-code-page">
      <header className="penal-code-hero">
        <div className="penal-code-hero-mark" aria-hidden="true"><ScrollText size={25} /></div>
        <div className="penal-code-hero-copy">
          <p className="penal-code-kicker">A STANDALONE LAW STUDY FEATURE</p>
          <h1>The Penal Code of Kenya</h1>
          <p className="penal-code-lede">Read and search the complete Penal Code (Cap. 63), provision by provision, including the edition record and alphabetical index.</p>
          <div className="penal-code-edition-badge">{source.edition} · {source.sectionCount} provisions</div>
        </div>
        <a className="penal-code-source-download" href={source.pdfUrl} target="_blank" rel="noreferrer">
          <Download size={16} /> Original PDF
        </a>
      </header>

      <div className="penal-code-notice" role="note">
        <strong>Edition note:</strong> This reader uses the Kenya Law edition dated 11 December 2023. It may not include later amendments. Check the official Kenya Law record before relying on it for legal work.
      </div>

      <div className="penal-code-workspace">
        <aside className="penal-code-index" aria-label="Penal Code contents">
          <label className="penal-code-search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sections or phrases" aria-label="Search Penal Code text" />
          </label>

          <div className="penal-code-index-toolbar">
            <span>CONTENTS</span>
            <button type="button" className={savedOnly ? "penal-code-filter is-active" : "penal-code-filter"} aria-pressed={savedOnly} onClick={() => setSavedOnly((current) => !current)}>
              <Bookmark size={14} /> Saved {saved.length ? `(${saved.length})` : ""}
            </button>
          </div>

          <div className="penal-code-special-links">
            <button type="button" className={selectedId === "front-matter" ? "penal-code-quicklink is-active" : "penal-code-quicklink"} onClick={() => selectContent("front-matter")}>
              <BookOpen size={14} /> Preface & contents
            </button>
            <button type="button" className={selectedId === "index" ? "penal-code-quicklink is-active" : "penal-code-quicklink"} onClick={() => selectContent("index")}>
              <Search size={14} /> Alphabetical index
            </button>
          </div>

          <label className="penal-code-chapter-filter">
            <span>Filter by chapter</span>
            <select value={chapterFilter} onChange={(event) => setChapterFilter(event.target.value)}>
              <option value="all">All chapters</option>
              {chapters.map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
            </select>
          </label>

          <p className="penal-code-results-note" aria-live="polite">
            {matchingSections.length} provision{matchingSections.length === 1 ? "" : "s"}{savedOnly ? " saved" : ""}{normalizedQuery ? " found" : " available"}
          </p>

          {normalizedQuery && (frontMatterMatches || indexMatches) && !savedOnly && (
            <div className="penal-code-search-extras">
              {frontMatterMatches && <button type="button" className={selectedId === "front-matter" ? "penal-code-result is-active" : "penal-code-result"} onClick={() => selectContent("front-matter")}><span className="penal-code-result-number">Intro</span><span className="penal-code-result-copy"><strong>Preface & contents</strong><small>Contains this phrase</small></span></button>}
              {indexMatches && <button type="button" className={selectedId === "index" ? "penal-code-result is-active" : "penal-code-result"} onClick={() => selectContent("index")}><span className="penal-code-result-number">Index</span><span className="penal-code-result-copy"><strong>Alphabetical index</strong><small>Contains this phrase</small></span></button>}
            </div>
          )}

          <div className="penal-code-section-list" aria-label="Provisions">
            {matchingSections.map((section) => (
              <button type="button" key={section.id} className={selectedId === section.id ? "penal-code-result is-active" : "penal-code-result"} onClick={() => selectContent(section.id)}>
                <span className="penal-code-result-number">{section.number}</span>
                <span className="penal-code-result-copy"><strong>{section.title}</strong><small>{section.chapter}</small></span>
              </button>
            ))}
            {!matchingSections.length && !(normalizedQuery && (frontMatterMatches || indexMatches) && !savedOnly) && <p className="penal-code-no-results">No provisions match these filters. Try another phrase or choose a different chapter.</p>}
          </div>
        </aside>

        <main className="penal-code-reader" ref={readerRef}>
          {selectedSpecial ? (
            <section className="penal-code-reading">
              <button type="button" className="penal-code-back" onClick={() => selectContent("section-1")}><ArrowLeft size={15} /> Section 1</button>
              <p className="penal-code-kicker">SOURCE DOCUMENT</p>
              <h2>{selectedTitle}</h2>
              <div className="penal-code-verbatim">{selectedId === "front-matter" ? source.frontMatter : source.indexText}</div>
              {selectedId === "index" && <footer className="penal-code-reading-footer">{source.indexEdition} OCR may contain recognition errors; use the 2023 statute text above for current provision wording. <a href={source.indexSourceUrl} target="_blank" rel="noreferrer">Open the original government PDF.</a></footer>}
            </section>
          ) : selectedSection ? (
            <section className="penal-code-reading">
              <div className="penal-code-reading-topline">
                <button type="button" className="penal-code-back" onClick={() => selectContent("front-matter")}><ArrowLeft size={15} /> Contents</button>
                <button type="button" className={saved.includes(selectedSection.id) ? "penal-code-save is-saved" : "penal-code-save"} onClick={() => toggleSaved(selectedSection.id)} aria-label={saved.includes(selectedSection.id) ? "Remove saved provision" : "Save provision"} title={saved.includes(selectedSection.id) ? "Remove saved provision" : "Save provision"}>
                  <Bookmark size={17} fill={saved.includes(selectedSection.id) ? "currentColor" : "none"} /> {saved.includes(selectedSection.id) ? "Saved" : "Save"}
                </button>
              </div>
              <p className="penal-code-kicker">{selectedSection.part}{selectedSection.division ? ` · ${selectedSection.division}` : ""}</p>
              <div className="penal-code-section-heading"><span>{selectedSection.number}</span><div><h2>Section {selectedSection.number}</h2><h3>{selectedSection.title}</h3></div></div>
              {selectedSection.text ? <div className="penal-code-verbatim">{selectedSection.text}</div> : <div className="penal-code-verbatim">No body text appears for this provision in the source edition.</div>}
              <footer className="penal-code-reading-footer">Source text from the Kenya Law edition dated 11 December 2023. No summary has replaced the provision.</footer>
            </section>
          ) : (
            <section className="penal-code-empty"><Search size={24} /><h2>Choose a provision</h2><p>Select a section from the contents or search for a phrase in the full text.</p></section>
          )}
        </main>
      </div>

      <footer className="penal-code-attribution">
        <strong>Source and attribution</strong>
        <span>{source.source}</span>
        <span>{source.license}</span>
        <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open official Kenya Law record</a>
      </footer>
    </div>
  );
}
