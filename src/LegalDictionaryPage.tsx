import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { LEGAL_DICTIONARY, searchLegalDictionary, type DictionaryShelf } from "./legalDictionary";
import "./legal-dictionary.css";

export default function LegalDictionaryPage() {
  const [shelf, setShelf] = useState<DictionaryShelf>("blacks");
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchLegalDictionary(query, shelf), [query, shelf]);
  return (
    <section className="dictionary-page">
      <header className="page-heading dictionary-heading">
        <div>
          <span className="eyebrow"><BookOpen size={14} /> LEGAL REFERENCE DESK</span>
          <h1>Law dictionary.</h1>
          <p className="subheading">Search a plain-language definition before you read, draft, argue, or ask the lawyer agent for a deeper explanation.</p>
        </div>
        <span className="dictionary-count">{LEGAL_DICTIONARY.length} study entries</span>
      </header>
      <div className="dictionary-disclaimer"><strong>Study reference:</strong> The Black&apos;s shelf uses original concise study summaries, not copied text from the commercial Black&apos;s Law Dictionary. Verify the meaning, jurisdiction, and current authority before relying on any definition.</div>
      <div className="dictionary-tabs" role="tablist" aria-label="Dictionary collections">
        <button type="button" className={shelf === "blacks" ? "active" : ""} onClick={() => setShelf("blacks")} role="tab" aria-selected={shelf === "blacks"}>Black&apos;s quick reference <small>Latin terms and core concepts</small></button>
        <button type="button" className={shelf === "law" ? "active" : ""} onClick={() => setShelf("law")} role="tab" aria-selected={shelf === "law"}>Law dictionary <small>General legal study terms</small></button>
      </div>
      <label className="dictionary-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search legal terms, meanings, or tags…" aria-label="Search legal dictionary" /><span>{matches.length}</span></label>
      <div className="dictionary-list">
        {matches.map((entry) => <article className="dictionary-entry" key={`${entry.shelf}-${entry.term}`}><div className="dictionary-entry-head"><h2>{entry.term}</h2><div>{entry.tags.map((tag) => <span className="dictionary-tag" key={tag}>{tag}</span>)}</div></div><p>{entry.definition}</p>{entry.example && <blockquote><strong>Example:</strong> {entry.example}</blockquote>}</article>)}
        {!matches.length && <div className="card card-pad empty">No matching term yet. Try a broader word, or ask the floating lawyer agent to explain the concept in context.</div>}
      </div>
    </section>
  );
}
