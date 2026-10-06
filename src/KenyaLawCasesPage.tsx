import { useState } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, Loader2, Moon, Search, Sun } from "lucide-react";
import { askAI } from "./lib/ai";
import { fetchKenyaLawCase, searchKenyaLaw, suggestCaseQueries, type KenyaLawCaseResult } from "./lib/kenyaLaw";
import { Markdown } from "./Markdown";
import { useTheme } from "./theme";
import "./kenya-law.css";

const courts = [
  { name: "Supreme Court", code: "KESC", note: "Final appellate authority" },
  { name: "Court of Appeal", code: "KECA", note: "Appellate decisions" },
  { name: "High Court", code: "KEHC", note: "Constitutional and other matters" },
  { name: "Employment and Labour Relations Court", code: "KEELRC", note: "Employment and labour disputes" },
  { name: "Environment and Land Court", code: "KEELC", note: "Land and environmental matters" },
  { name: "Magistrates’ Courts", code: "KEMC", note: "Subordinate-court decisions" },
  { name: "Kadhi’s Courts", code: "KEKC", note: "Personal-status matters" },
  { name: "Small Claims Court", code: "SCC", note: "Small civil claims" },
];

export default function KenyaLawCasesPage() {
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KenyaLawCaseResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedCase, setSelectedCase] = useState<KenyaLawCaseResult | null>(null);
  const [summary, setSummary] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const searchOfficialCases = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setBusy(true);
    setError("");
    setResults([]);
    setSelectedCase(null);
    setSummary("");
    setSummaryError("");
    setSuggestions([]);
    try {
      const found = await searchKenyaLaw(term);
      setResults(found);
      if (!found.length) setSuggestions(suggestCaseQueries(term));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The case search is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  const summarizeCase = async (selected: KenyaLawCaseResult) => {
    setSelectedCase(selected);
    setSummary("");
    setSummaryError("");
    setSummaryBusy(true);
    try {
      const document = await fetchKenyaLawCase(selected.url);
      const result = await askAI({
        feature: "case_brief",
        mode: "general",
        messages: [{
          role: "user",
          content: `Prepare a careful Kenyan case-law study brief using ONLY the official judgment text below. Do not invent facts, arguments, authorities, quotations, or holdings. If the judgment does not state something clearly, write "Not clearly stated in the judgment." Use exactly these headings and answer each in plain language:\n\n## What happened?\nSummarise the material facts and procedural history.\n\n## Why was the case brought?\nExplain why the claimant/appellant/petitioner sued or appealed and what relief was sought.\n\n## What issues did the judge decide?\nList the legal questions.\n\n## What did the judge say, and why?\nExplain the holding and the court's reasoning, separating the parties' arguments from the court's own findings.\n\n## What was the outcome?\nState the orders, remedy, costs, and whether the case was allowed, dismissed, or partly allowed.\n\n## Key legal principles\nList the principles a Kenyan law student should remember, with statutory or constitutional provisions only when stated in the judgment.\n\n## Tort-law connection\nExplain how the decision relates to torts, or say that no direct tort-law connection is stated.\n\n## Citation and source\nGive the case citation from the judgment and link to the official source: ${document.url}\n\nOfficial judgment title: ${document.title}\n\nOfficial judgment text:\n${document.text.slice(0, 48000)}`,
        }],
      });
      setSummary(result.answer);
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : "The case could not be summarized right now.");
    } finally {
      setSummaryBusy(false);
    }
  };

  return (
    <main className="kl-page" id="top">
      <header className="kl-header">
        <a className="kl-brand" href="/" aria-label="Group 13 home">
          <span className="kl-brand-mark">13</span>
          <span><strong>GROUP 13</strong><small>LAW SCHOOL HUB</small></span>
        </a>
        <nav className="kl-nav" aria-label="Public navigation">
          <button type="button" className="kl-back" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/")}><ArrowLeft size={14} /> Back</button>
          <a href="/">Home</a>
          <a href="/features">All features</a>
          <button type="button" className="kl-theme-toggle" onClick={toggleTheme}>{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />} {theme === "dark" ? "Light mode" : "Dark mode"}</button>
          <a href="/login">Sign in</a>
        </nav>
      </header>

      <div className="kl-main">
        <section className="kl-intro" aria-labelledby="kl-title">
          <p className="kl-eyebrow">OFFICIAL KENYAN CASE LAW</p>
          <h1 id="kl-title">Read the cases.<br /><strong>Go to the source.</strong></h1>
          <p className="kl-lede">Search published judgments by case name, legal issue, or citation. Select a result and the assistant will read the official judgment and prepare a structured study brief.</p>
          <form className="kl-search" onSubmit={(event) => void searchOfficialCases(event)} role="search">
            <Search size={19} aria-hidden="true" />
            <label className="kl-sr-only" htmlFor="kl-case-query">Search Kenyan judgments</label>
            <input id="kl-case-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Case name, citation, or legal issue" required />
            <button type="submit" disabled={busy}>{busy ? <><Loader2 className="kl-spin" size={16} /> Searching</> : <>Find cases <Search size={16} /></>}</button>
          </form>
          <p className="kl-search-note">The free worker searches public official Kenya Law links and returns the result here. It does not require a Google login.</p>
          {error && <p className="kl-error" role="alert">{error}</p>}
          {results.length > 0 && <section className="kl-results" aria-live="polite" aria-labelledby="kl-results-title"><div className="kl-results-head"><div><p className="kl-eyebrow">RESEARCH OUTPUT</p><h2 id="kl-results-title">Relevant judgments.</h2></div><span>{results.length} result{results.length === 1 ? "" : "s"}</span></div><div className="kl-result-list">{results.map((result) => <button type="button" className={`kl-result-button${selectedCase?.url === result.url ? " active" : ""}`} key={result.url} onClick={() => void summarizeCase(result)} disabled={summaryBusy}><span><strong>{result.title}</strong>{result.citation && <small>{result.citation}</small>}<em>{selectedCase?.url === result.url && summaryBusy ? "Preparing structured brief…" : "Select case and summarize"}</em></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}</div></section>}
          {results.length === 0 && !busy && !error && query.trim().length >= 3 && <div className="kl-no-results"><p>No indexed match was returned for that query. Try a case name, citation, statute, or legal issue.</p><p><a className="kl-advanced" href={`https://kenyalaw.org/search/?show-advanced-tab=1&nature=Judgment&q=${encodeURIComponent(query.trim())}`} target="_blank" rel="noopener noreferrer">Open Kenya Law advanced search for this query <ArrowUpRight size={14} /></a></p>{suggestions.length > 0 && <div className="kl-suggestions"><strong>Try a related search:</strong>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setQuery(suggestion); void searchKenyaLaw(suggestion).then((found) => { setResults(found); setSuggestions(found.length ? [] : suggestCaseQueries(suggestion)); }).catch((cause) => setError(cause instanceof Error ? cause.message : "The case search is unavailable right now.")); }}>{suggestion}</button>)}</div>}</div>}
          {selectedCase && <section className="kl-brief" aria-live="polite" aria-labelledby="kl-brief-title"><div className="kl-results-head"><div><p className="kl-eyebrow">STRUCTURED CASE BRIEF</p><h2 id="kl-brief-title">{selectedCase.title}</h2></div><a href={selectedCase.url} target="_blank" rel="noopener noreferrer">Open official judgment <ArrowUpRight size={15} /></a></div>{summaryBusy && <div className="kl-brief-loading"><Loader2 className="kl-spin" size={18} /> Reading the official judgment and preparing the brief…</div>}{summaryError && <p className="kl-error" role="alert">{summaryError}</p>}{summary && <div className="kl-brief-body"><Markdown text={summary} /></div>}</section>}
        </section>

        <section className="kl-courts" aria-labelledby="kl-courts-title">
          <div className="kl-section-head">
            <div><p className="kl-eyebrow">BROWSE BY COURT</p><h2 id="kl-courts-title">Follow the judgment trail.</h2></div>
            <p>Each route opens the current official collection on Kenya Law.</p>
          </div>
          <div className="kl-court-list">
            {courts.map((court) => (
              <a key={court.code} href={`https://kenyalaw.org/judgments/${court.code}/`} target="_blank" rel="noopener noreferrer">
                <span><strong>{court.name}</strong><small>{court.note}</small></span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>

        <section className="kl-constitution" aria-labelledby="kl-constitution-title">
          <div>
            <p className="kl-constitution-label">THE SUPREME LAW</p>
            <h2 id="kl-constitution-title">Begin with the Constitution.</h2>
            <p>Article 2 establishes the Constitution’s supremacy and its binding force across Kenya’s two levels of government.</p>
          </div>
          <a href="https://kenyalaw.org/akn/ke/act/2010/constitution" target="_blank" rel="noopener noreferrer">Read the Constitution of Kenya <ArrowUpRight size={16} /></a>
        </section>

        <section className="kl-study-note" aria-labelledby="kl-study-title">
          <div><p className="kl-eyebrow">FOR YOUR STUDY</p><h2 id="kl-study-title">Bring the authority into your notes.</h2></div>
          <p>Open the judgment on Kenya Law and keep its case name and citation with your notes. For AI analysis, save the full judgment text or PDF as an AI-readable Library document, then select that document. A reference link alone does not supply the judgment text; the assistant will not guess a case citation.</p>
        </section>
      </div>

      <footer className="kl-footer">
        <a className="kl-brand" href="/" aria-label="Group 13 home"><span className="kl-brand-mark">13</span><span><strong>GROUP 13</strong><small>LAW SCHOOL HUB</small></span></a>
        <span>Case searches and original judgments are provided by Kenya Law.</span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
