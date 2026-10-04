import { useState } from "react";
import { ArrowUpRight, BookOpen, Search } from "lucide-react";
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
  const [query, setQuery] = useState("");

  const searchOfficialCases = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    const url = new URL("https://kenyalaw.org/search/");
    url.searchParams.set("q", term);
    url.searchParams.set("nature", "Judgment");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };

  return (
    <main className="kl-page" id="top">
      <header className="kl-header">
        <a className="kl-brand" href="/" aria-label="Group 13 home">
          <span className="kl-brand-mark">13</span>
          <span><strong>GROUP 13</strong><small>LAW SCHOOL HUB</small></span>
        </a>
        <nav className="kl-nav" aria-label="Public navigation">
          <a href="/">Home</a>
          <a href="/features">All features</a>
          <a href="/login">Sign in</a>
        </nav>
      </header>

      <div className="kl-main">
        <section className="kl-intro" aria-labelledby="kl-title">
          <p className="kl-eyebrow">OFFICIAL KENYAN CASE LAW</p>
          <h1 id="kl-title">Read the cases.<br /><strong>Go to the source.</strong></h1>
          <p className="kl-lede">Search published judgments by case name, legal issue, or citation. Results open on Kenya Law, the National Council for Law Reporting’s official legal-information site.</p>
          <form className="kl-search" onSubmit={searchOfficialCases} role="search">
            <Search size={19} aria-hidden="true" />
            <label className="kl-sr-only" htmlFor="kl-case-query">Search Kenyan judgments</label>
            <input id="kl-case-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Case name, citation, or legal issue" required />
            <button type="submit">Search judgments <ArrowUpRight size={16} /></button>
          </form>
          <a className="kl-advanced" href="https://kenyalaw.org/search/?show-advanced-tab=1&nature=Judgment" target="_blank" rel="noopener noreferrer">Open Kenya Law advanced search <ArrowUpRight size={14} /></a>
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
