import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, CalendarDays, ExternalLink, Loader2, Search } from "lucide-react";
import { searchKenyaCauseLists, type KenyaCauseListResult } from "./lib/kenyaLaw";
import "./scheduled-cases.css";

const initialQuery = "Nairobi Milimani Law Courts cause list";

type CourtScope = "all" | "high-court" | "magistrates";

export default function ScheduledCourtCasesPage() {
  const [scope, setScope] = useState<CourtScope>("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KenyaCauseListResult[]>([]);
  const [portalUrl, setPortalUrl] = useState("https://causelist.court.go.ke/causelist");
  const [archiveUrl, setArchiveUrl] = useState("https://kenyalaw.org/causelists/");
  const [caveat, setCaveat] = useState("A cause list is a dated public court schedule, not a complete case register.");
  const [busy, setBusy] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  const search = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setBusy(true);
    setHasSearched(true);
    setError("");
    const scopeText = scope === "high-court" ? "High Court" : scope === "magistrates" ? "Chief Magistrate" : "High Court Magistrate";
    const searchQuery = `${scopeText} Nairobi Milimani Law Courts cause list ${query.trim()}`.trim();
    try {
      const response = await searchKenyaCauseLists(searchQuery);
      setResults(response.results);
      setPortalUrl(response.judiciaryPortalUrl);
      setArchiveUrl(response.officialSearchUrl);
      setCaveat(response.caveat);
    } catch (cause) {
      setResults([]);
      setError(cause instanceof Error ? cause.message : "The scheduled court case search is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void search();
  }, []);

  return (
    <main className="scheduled-page" id="scheduled-top">
      <header className="scheduled-header">
        <a className="scheduled-brand" href="/" aria-label="Group 13 home"><span>13</span><strong>GROUP 13<small>LAW SCHOOL HUB</small></strong></a>
        <nav aria-label="Scheduled cases navigation">
          <button type="button" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/")}><ArrowLeft size={14} /> Back</button>
          <a href="/cases">Case law</a>
          <a href={portalUrl} target="_blank" rel="noopener noreferrer">Judiciary portal <ExternalLink size={13} /></a>
        </nav>
      </header>

      <div className="scheduled-main">
        <section className="scheduled-hero" aria-labelledby="scheduled-title">
          <div className="scheduled-kicker"><CalendarDays size={15} /> COURT SCHEDULES</div>
          <h1 id="scheduled-title">View scheduled<br /><em>court cases.</em></h1>
          <p>Search public cause-list documents for Nairobi and Milimani Law Courts. Choose a court level, add a case name or division if you know it, and open the official schedule.</p>
          <form className="scheduled-search" onSubmit={(event) => void search(event)} role="search">
            <label htmlFor="scheduled-scope">Court</label>
            <select id="scheduled-scope" value={scope} onChange={(event) => setScope(event.target.value as CourtScope)}>
              <option value="all">All Milimani courts</option>
              <option value="high-court">High Court</option>
              <option value="magistrates">Chief Magistrate’s Court</option>
            </select>
            <label className="scheduled-query-label" htmlFor="scheduled-query">Case or division</label>
            <input id="scheduled-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Optional: case name, Civil, Criminal…" />
            <button type="submit" disabled={busy}>{busy ? <><Loader2 className="scheduled-spin" size={16} /> Checking</> : <><Search size={16} /> View schedules</>}</button>
          </form>
          <div className="scheduled-source-note"><span>Source</span> Official Kenya Law cause-list archive, with a direct link to the Judiciary Causelist Portal for live station, division and date filters.</div>
        </section>

        <section className="scheduled-results" aria-live="polite" aria-labelledby="scheduled-results-title">
          <div className="scheduled-results-head"><div><span className="scheduled-eyebrow">PUBLIC SCHEDULE DOCUMENTS</span><h2 id="scheduled-results-title">{results.length ? `${results.length} schedules found` : hasSearched ? "No matching schedules" : "Recent schedules"}</h2></div><a href={archiveUrl} target="_blank" rel="noopener noreferrer">Open archive <ArrowUpRight size={15} /></a></div>
          {error && <p className="scheduled-error" role="alert">{error}</p>}
          {busy && <div className="scheduled-loading"><Loader2 className="scheduled-spin" size={18} /> Searching official cause-list records…</div>}
          {!busy && results.length > 0 && <div className="scheduled-list">{results.map((result) => <article className="scheduled-card" key={result.url}><div className="scheduled-card-mark"><CalendarDays size={18} /></div><div className="scheduled-card-content"><span className="scheduled-card-court">{result.court}</span><h3>{result.title}</h3>{result.dateRange && <p className="scheduled-date">{result.dateRange}</p>}<a href={result.url} target="_blank" rel="noopener noreferrer">Open official cause list <ArrowUpRight size={14} /></a></div></article>)}</div>}
          {!busy && !error && !results.length && hasSearched && <div className="scheduled-empty"><CalendarDays size={24} /><strong>No matching public schedule was returned.</strong><p>Try a broader search or use the Judiciary portal to choose a station, division and date range directly.</p><a href={portalUrl} target="_blank" rel="noopener noreferrer">Open Judiciary Causelist Portal <ArrowUpRight size={14} /></a></div>}
        </section>

        <section className="scheduled-caveat"><strong>How to read this page</strong><p>{caveat}</p><p>The schedule link is the authoritative document. The platform does not access private court files, and a missing cause-list entry does not prove that no case exists.</p></section>
      </div>
      <footer className="scheduled-footer"><a className="scheduled-brand" href="/"><span>13</span><strong>GROUP 13<small>LAW SCHOOL HUB</small></strong></a><a href="#scheduled-top">Back to top ↑</a></footer>
    </main>
  );
}
