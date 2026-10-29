import { useMemo, useState, type ChangeEvent } from "react";
import { ExternalLink, FileText, Loader2, Trash2, Upload } from "lucide-react";
import type { CareerFeedItem } from "./lib/careerFeed";
import { readCvText } from "./lib/cvDocumentReader";
import { buildCVProfile, matchCVToOpportunities, opportunityKind, type CVProfile } from "./lib/cvOpportunityMatcher";

type Props = { items: CareerFeedItem[]; loading: boolean };

export default function CareerCvMatcher({ items, loading }: Props) {
  const [profile, setProfile] = useState<CVProfile | null>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [includeDegreeRequired, setIncludeDegreeRequired] = useState(false);

  const matches = useMemo(() => profile ? matchCVToOpportunities(profile, items) : [], [profile, items]);
  const degreeRequiredMatches = matches.filter((match) => match.qualificationFit === "degree-required");
  const hiddenDegreeMatches = includeDegreeRequired ? 0 : degreeRequiredMatches.length;
  const visibleMatches = matches
    .filter((match) => includeDegreeRequired || match.qualificationFit !== "degree-required")
    .slice(0, 6);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setReading(true);
    setError("");
    try {
      const text = await readCvText(file);
      const nextProfile = buildCVProfile(text);
      if (!nextProfile.keywords.length && !nextProfile.certificates.length && !nextProfile.completedDegrees.length && !nextProfile.inProgressDegrees.length) {
        throw new Error("I could not identify skills or qualifications in this CV. Try a text-based PDF or DOCX with clear headings.");
      }
      setProfile(nextProfile);
      setFileName(file.name);
      setIncludeDegreeRequired(false);
    } catch (caught) {
      setProfile(null);
      setFileName("");
      setError(caught instanceof Error ? caught.message : "The CV could not be read in this browser.");
    } finally {
      setReading(false);
      input.value = "";
    }
  };

  const clearProfile = () => {
    setProfile(null);
    setFileName("");
    setError("");
    setIncludeDegreeRequired(false);
  };

  return <section className="card card-pad career-cv-panel" aria-label="Match opportunities to your CV">
    <div className="career-cv-heading">
      <div>
        <div className="section-label"><FileText size={15} /> Match opportunities to your CV</div>
        <p className="field-hint">Upload a searchable PDF, DOCX, or TXT CV. Matching is done in this browser; the file is not uploaded, sent to AI, or saved to your account.</p>
      </div>
      {profile && <button type="button" className="secondary-button career-cv-clear" onClick={clearProfile}><Trash2 size={14} /> Clear CV match</button>}
    </div>

    <div className="career-cv-actions">
      <label className={`career-cv-upload${reading ? " is-reading" : ""}`}>
        {reading ? <Loader2 size={16} className="career-spin" /> : <Upload size={16} />}
        <span>{reading ? "Reading CV locally…" : profile ? "Upload another CV" : "Choose CV"}</span>
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(event) => void handleFileChange(event)}
          disabled={reading}
          aria-label="Choose CV file"
        />
      </label>
      {fileName && <span className="career-cv-filename"><FileText size={14} /> {fileName}</span>}
    </div>

    {error && <div className="connection-error" role="alert">{error}</div>}

    {profile && <>
      <div className="career-cv-profile" role="status">
        <strong>Detected qualifications — check these against your CV</strong>
        <div><b>Certificates:</b> {profile.certificates.length ? profile.certificates.slice(0, 3).join(" · ") : "None detected"}</div>
        <div><b>Completed degrees:</b> {profile.completedDegrees.length ? profile.completedDegrees.slice(0, 3).join(" · ") : "None detected"}</div>
        {profile.inProgressDegrees.length > 0 && <div><b>In progress:</b> {profile.inProgressDegrees.slice(0, 2).join(" · ")} <span>(not counted as completed)</span></div>}
      </div>

      {profile.completedDegrees.length === 0 && degreeRequiredMatches.length > 0 && <label className="career-cv-degree-toggle">
        <input type="checkbox" checked={includeDegreeRequired} onChange={(event) => setIncludeDegreeRequired(event.target.checked)} />
        Include {degreeRequiredMatches.length} listing{degreeRequiredMatches.length === 1 ? "" : "s"} that appear to require a completed degree
      </label>}

      <div className="career-cv-results-heading">
        <strong>{visibleMatches.length ? `Best matches from the current feed` : "No strong keyword matches found yet"}</strong>
        {loading && items.length === 0 && <span className="quiet">Waiting for Kenya listings…</span>}
      </div>
      {visibleMatches.length > 0 ? <div className="career-cv-match-list">{visibleMatches.map((match) => <article className="career-cv-match" key={match.item.url}>
        <div className="career-meta"><span className="career-tag">{opportunityKind(match.item)}</span><span className="career-tag">{match.qualificationFit === "certificate-mentioned" ? "Certificate match to verify" : match.qualificationFit === "certificate-not-found" ? "Certificate not detected" : match.qualificationFit === "degree-required" ? "Degree requirement" : match.qualificationFit === "degree-mentioned" ? "Degree mentioned · check" : match.qualificationFit === "degree-in-cv" ? "Degree detected in CV" : "Qualification check"}</span></div>
        <h3><a href={match.item.url} target="_blank" rel="noreferrer">{match.item.title}</a></h3>
        {match.matchedTerms.length > 0 && <p className="career-cv-matched-terms"><b>CV terms found:</b> {match.matchedTerms.join(" · ")}</p>}
        <p className="career-cv-qualification-note">{match.qualificationNote}</p>
        <a className="career-link" href={match.item.url} target="_blank" rel="noreferrer">Review original listing <ExternalLink size={13} /></a>
      </article>)}</div> : <p className="field-hint career-cv-empty">{hiddenDegreeMatches > 0 ? `${hiddenDegreeMatches} relevant listing${hiddenDegreeMatches === 1 ? "" : "s"} mention a completed-degree requirement and are hidden by default. Use the checkbox above to review them.` : items.length === 0 && loading ? "Your CV stays in this browser while the current Kenya feed loads." : "Try a CV with clear skills and qualification sections, or use the official Kenyan opportunity boards below. A low keyword match is not a judgment on your suitability."}</p>}
    </>}

    <p className="field-hint career-cv-disclaimer">This is a local keyword match, not an eligibility decision. Certificate, diploma, and degree qualifications are kept separate; listings that appear to require a degree are flagged and hidden by default when no completed degree was detected. The live feed mainly covers NGO and development-sector roles; the official boards below link to other opportunities that may not appear in this feed.</p>
  </section>;
}
