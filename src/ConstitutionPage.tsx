import { useMemo, useState } from "react";
import { ArrowLeft, Bookmark, BookOpen, Download, Search, ScrollText } from "lucide-react";
import constitution from "./data/constitution-2010.json";
import "./constitution.css";

type Article = { number: number; title: string; text: string };
type Part = { number: string; title: string; beforeArticle: number };
type Chapter = { number: string; title: string; firstArticle: number; parts: Part[]; articles: Article[] };
type Schedule = { number: string; title: string; text: string };
const source = constitution as {
  edition: string;
  title: string;
  source: string;
  attribution: string;
  preamble: string;
  chapters: Chapter[];
  schedules: Schedule[];
};
const storageKey = "llb13-constitution-bookmarks-v1";
const loadBookmarks = (): number[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
};

export default function ConstitutionPage() {
  const [selectedChapter, setSelectedChapter] = useState(0);
  const [selectedArticle, setSelectedArticle] = useState<number | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<number[]>(loadBookmarks);
  const [savedOnly, setSavedOnly] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const allArticles = useMemo(() => source.chapters.flatMap((chapter) => chapter.articles), []);
  const article = selectedArticle === null ? null : allArticles.find((item) => item.number === selectedArticle) ?? null;
  const chapter = source.chapters[selectedChapter] ?? source.chapters[0];
  const articleChapter = article ? source.chapters.find((item) => item.articles.some((entry) => entry.number === article.number)) : undefined;
  const articlePart = article && articleChapter ? articleChapter.parts.find((part, index) => article.number >= part.beforeArticle && article.number < (articleChapter.parts[index + 1]?.beforeArticle ?? Infinity)) : undefined;
  const matchingArticles = useMemo(() => {
    const pool = normalizedQuery
      ? allArticles.filter((item) => {
        const owner = source.chapters.find((candidate) => candidate.articles.some((entry) => entry.number === item.number));
        const partContext = owner?.parts.filter((part, index) => item.number >= part.beforeArticle && item.number < (owner.parts[index + 1]?.beforeArticle ?? Infinity)).map((part) => part.title).join(" ") ?? "";
        return `${item.number} ${item.title} ${item.text} ${owner?.title ?? ""} ${partContext}`.toLocaleLowerCase().includes(normalizedQuery);
      })
      : chapter.articles;
    return pool.filter((item) => (!savedOnly || saved.includes(item.number)));
  }, [allArticles, chapter, normalizedQuery, saved, savedOnly]);

  const selectArticle = (item: Article) => {
    const chapterIndex = source.chapters.findIndex((entry) => entry.articles.some((candidate) => candidate.number === item.number));
    if (chapterIndex >= 0) setSelectedChapter(chapterIndex);
    setSelectedArticle(item.number);
    setSelectedSchedule(null);
  };
  const toggleSaved = (number: number) => {
    const next = saved.includes(number) ? saved.filter((value) => value !== number) : [...saved, number].sort((a, b) => a - b);
    setSaved(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the current session usable if storage is unavailable. */ }
  };
  const clearSelection = () => { setSelectedArticle(null); setSelectedSchedule(null); };

  return (
    <div className="constitution-page">
      <header className="constitution-hero">
        <div className="constitution-hero-mark" aria-hidden="true"><ScrollText size={27} /></div>
        <div className="constitution-hero-copy">
          <p className="constitution-kicker">A STANDALONE LAW STUDY FEATURE</p>
          <h1>The Constitution of Kenya</h1>
          <p className="constitution-lede">Move through the Constitution itself—by chapter, article, and schedule. The source text is presented as provided, not replaced by summaries.</p>
          <div className="constitution-source-badge">Edition in your PDF · legislation as at 3 September 2010</div>
        </div>
        <a className="constitution-source-download" href="/constitution/ConstitutionofKenya-2010.pdf" download>
          <Download size={16} /> Original PDF
        </a>
      </header>

      <div className="constitution-notice" role="note">
        <strong>Edition note:</strong> This feature reproduces the edition supplied in your PDF. It is not labeled as a current consolidated edition. Check an official current source for later amendments or legal use.
      </div>

      <div className="constitution-workspace">
        <aside className="constitution-index" aria-label="Constitution contents">
          <label className="constitution-search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); clearSelection(); }} placeholder="Find an article or phrase" aria-label="Search Constitution text" />
          </label>
          <div className="constitution-index-toolbar">
            <span>CONTENTS</span>
            <button type="button" className={savedOnly ? "constitution-filter is-active" : "constitution-filter"} onClick={() => setSavedOnly((current) => !current)}>
              <Bookmark size={14} /> Saved {saved.length ? `(${saved.length})` : ""}
            </button>
          </div>
          {!normalizedQuery && !savedOnly && (
            <>
              <button type="button" className={selectedArticle === null && !selectedSchedule && selectedChapter === -1 ? "constitution-prelude is-active" : "constitution-prelude"} onClick={() => { setSelectedChapter(-1); clearSelection(); setQuery(""); }}>
                <span>Preamble</span><span className="constitution-count">Opening text</span>
              </button>
              <div className="constitution-chapter-list">
                {source.chapters.map((item, index) => (
                  <button type="button" key={item.number} className={selectedChapter === index && !selectedSchedule ? "constitution-chapter is-active" : "constitution-chapter"} onClick={() => { setSelectedChapter(index); clearSelection(); }}>
                    <span className="constitution-chapter-number">CHAPTER {item.number}</span>
                    <span className="constitution-chapter-title">{item.title}</span>
                    <span className="constitution-count">Articles {item.articles[0]?.number}–{item.articles[item.articles.length - 1]?.number}</span>
                  </button>
                ))}
              </div>
              <div className="constitution-index-toolbar schedules-heading">SCHEDULES</div>
              {source.schedules.map((item) => (
                <button type="button" className={selectedSchedule === item.number ? "constitution-schedule-link is-active" : "constitution-schedule-link"} key={item.number} onClick={() => { setSelectedSchedule(item.number); setSelectedArticle(null); }}>
                  <span>{item.title}</span>
                </button>
              ))}
            </>
          )}
          {(normalizedQuery || savedOnly) && <p className="constitution-results-note">{matchingArticles.length} matching provision{matchingArticles.length === 1 ? "" : "s"}</p>}
          {(normalizedQuery || savedOnly) && matchingArticles.map((item) => (
            <button type="button" key={item.number} className={selectedArticle === item.number ? "constitution-result is-active" : "constitution-result"} onClick={() => selectArticle(item)}>
              <span>Article {item.number}</span><strong>{item.title}</strong>
            </button>
          ))}
        </aside>

        <main className="constitution-reader">
          {selectedSchedule ? (() => {
            const item = source.schedules.find((entry) => entry.number === selectedSchedule)!;
            return <section className="constitution-reading"><button type="button" className="constitution-back" onClick={clearSelection}><ArrowLeft size={15} /> Contents</button><p className="constitution-kicker">SUPPLEMENTARY CONSTITUTIONAL TEXT</p><h2>{item.title}</h2><div className="constitution-verbatim">{item.text}</div></section>;
          })() : article ? (
            <section className="constitution-reading">
              <button type="button" className="constitution-back" onClick={clearSelection}><ArrowLeft size={15} /> {chapter.title}</button>
              <div className="constitution-article-head">
                  <div><p className="constitution-kicker">CHAPTER {articleChapter?.number}</p>{articlePart && <p className="constitution-part-context">PART {articlePart.number} · {articlePart.title}</p>}<h2>Article {article.number}</h2><h3>{article.title}</h3></div>
                <button type="button" className={saved.includes(article.number) ? "constitution-save is-saved" : "constitution-save"} onClick={() => toggleSaved(article.number)} aria-label={saved.includes(article.number) ? "Remove saved article" : "Save article"} title={saved.includes(article.number) ? "Remove saved article" : "Save article"}><Bookmark size={18} fill={saved.includes(article.number) ? "currentColor" : "none"} />{saved.includes(article.number) ? "Saved" : "Save"}</button>
              </div>
              <div className="constitution-verbatim">{article.text || article.title}</div>
              <div className="constitution-reading-footer">Verbatim source text from the supplied 2010 edition. Use “Original PDF” above to compare against the uploaded document.</div>
            </section>
          ) : normalizedQuery || savedOnly ? (
            <section className="constitution-empty"><Search size={24} /><h2>{matchingArticles.length ? "Choose a provision" : savedOnly ? "No saved articles yet" : "No matching articles"}</h2><p>{matchingArticles.length ? "Select a result to read the full provision." : savedOnly ? "Save any article to keep it in your personal study list." : "Try an article number, a heading, or a phrase from the Constitution."}</p></section>
          ) : selectedChapter === -1 ? (
            <section className="constitution-reading"><p className="constitution-kicker">CONSTITUTION OF KENYA</p><h2>Preamble</h2><div className="constitution-verbatim">{source.preamble}</div></section>
          ) : (
            <section className="constitution-chapter-view">
              <div className="constitution-chapter-intro"><div><p className="constitution-kicker">CHAPTER {chapter.number} · {chapter.articles.length} ARTICLES</p><h2>{chapter.title}</h2><p>Select an article to read the complete source text. Each article remains separately addressable and saveable.</p></div><BookOpen size={28} aria-hidden="true" /></div>
              <div className="constitution-article-list">
                {chapter.articles.map((item) => {
                  const part = chapter.parts.find((entry) => entry.beforeArticle === item.number);
                  return <div className="constitution-article-entry" key={item.number}>{part && <h3 className="constitution-part-heading">PART {part.number}<span>{part.title}</span></h3>}<button type="button" className="constitution-article-card" onClick={() => selectArticle(item)}><span className="article-card-number">{item.number}</span><span className="article-card-copy"><strong>{item.title}</strong><small>Open full article</small></span><span className="article-card-bookmark">{saved.includes(item.number) && <Bookmark size={15} fill="currentColor" />}</span></button></div>;
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      <footer className="constitution-attribution"><strong>Source and attribution</strong><span>{source.attribution}</span><span>{source.source}</span><a href="https://kenyalaw.org/" target="_blank" rel="noreferrer">Kenya Law official site</a></footer>
    </div>
  );
}
