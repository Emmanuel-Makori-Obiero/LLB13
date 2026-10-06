import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Search } from "lucide-react";
import { LEGAL_DICTIONARY, searchLegalDictionary, type DictionaryShelf } from "./legalDictionary";
import "./legal-dictionary.css";
import { searchKenyaLaw, type KenyaLawCaseResult } from "./lib/kenyaLaw";
import StorytellButton from "./StorytellButton";

export default function LegalDictionaryPage() {
  const [shelf, setShelf] = useState<DictionaryShelf>("blacks");
  const [query, setQuery] = useState("");
  const [officialResults, setOfficialResults] = useState<KenyaLawCaseResult[]>([]);
  const [officialBusy, setOfficialBusy] = useState(false);
  const [officialError, setOfficialError] = useState("");
  const matches = useMemo(() => searchLegalDictionary(query, shelf), [query, shelf]);
  const lookupOfficial = async () => {
    const term = query.trim();
    if (term.length < 3) return;
    setOfficialBusy(true); setOfficialError(""); setOfficialResults([]);
    try { setOfficialResults(await searchKenyaLaw(term)); }
    catch (error) { setOfficialError(error instanceof Error ? error.message : "The official lookup is unavailable right now."); }
    finally { setOfficialBusy(false); }
  };
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
      <div className="dictionary-search-row">
        <label className="dictionary-search"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setOfficialResults([]); setOfficialError(""); }} placeholder="Search legal terms, meanings, or tags…" aria-label="Search legal dictionary" /><span>{matches.length}</span></label>
        <button type="button" className="secondary-button dictionary-lookup" onClick={() => void lookupOfficial()} disabled={officialBusy || query.trim().length < 3}><Search size={14} /> {officialBusy ? "Searching…" : "Search Kenya Law"}</button>
      </div>
      {(officialError || officialResults.length > 0) && <section className="dictionary-official card card-pad"><div className="dictionary-official-head"><div><div className="section-label">Official source lookup</div><p className="field-hint">Results are links to Kenya Law records. Open the source before relying on a definition or citation.</p></div><a href={`https://new.kenyalaw.org/search/?q=${encodeURIComponent(query.trim())}`} target="_blank" rel="noreferrer" className="dictionary-open-link">Open advanced search <ArrowUpRight size={14} /></a></div>{officialError && <p className="dictionary-error">{officialError}</p>}{officialResults.length > 0 && <div className="dictionary-official-list">{officialResults.slice(0, 8).map((result) => <a key={`${result.url}-${result.title}`} href={result.url} target="_blank" rel="noreferrer"><span><strong>{result.title}</strong>{result.citation && <small>{result.citation}</small>}</span><ArrowUpRight size={14} /></a>)}</div>}</section>}
      <div className="dictionary-list">
        {matches.map((entry) => <article className="dictionary-entry" key={`${entry.shelf}-${entry.term}`}><div className="dictionary-entry-head"><h2>{entry.term}</h2><div>{entry.tags.map((tag) => <span className="dictionary-tag" key={tag}>{tag}</span>)}</div></div><p>{entry.definition}</p>{entry.example && <blockquote><strong>Example:</strong> {entry.example}</blockquote>}<StorytellButton title={entry.term} source={`${entry.term}: ${entry.definition}${entry.example ? ` Example: ${entry.example}` : ""}`} /></article>)}
        {!matches.length && <div className="card card-pad empty">No matching term yet. Try a broader word, or ask the floating lawyer agent to explain the concept in context.</div>}
      </div>
    </section>
  );
}
