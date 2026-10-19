import { useEffect, useMemo, useState } from "react";
import { ExternalLink, GraduationCap, RefreshCw, Search } from "lucide-react";
import { supabase } from "./data/repository";
import "./career-research.css";

type FeedItem = {
  title: string;
  url: string;
  description: string;
  published_at: string | null;
  categories: string[];
};
type FeedResponse = {
  source?: string;
  updated_at?: string;
  items?: FeedItem[];
  notice?: string;
  error?: string;
};

const interests = [
  ["all", "All interests"],
  ["technology", "Technology"],
  ["law", "Law"],
  ["creative", "Creative arts"],
  ["music", "Music & singing"],
  ["business", "Business"],
  ["education", "Education & research"],
  ["health", "Health & wellbeing"],
  ["environment", "Environment"],
  ["public-service", "Public service"],
  ["other", "Other"],
] as const;

function interestTags(item: FeedItem): Set<string> {
  const text = `${item.title} ${item.description} ${item.categories.join(" ")}`.toLowerCase();
  const tags = new Set<string>();
  if (/\b(tech|technology|software|coding|digital|cyber|data|artificial intelligence|\bai\b|engineering|computer|robotics)\b/.test(text)) tags.add("technology");
  if (/\b(law|legal|justice|court|human rights|advocacy|policy|constitutional)\b/.test(text)) tags.add("law");
  if (/\b(art|creative|film|design|media|journalism|writing|poet|photograph|dance|theatre|fashion|illustrat)\b/.test(text)) tags.add("creative");
  if (/\b(music|sing(?:ing|er)?|song|vocal|choir|instrument|perform(?:ance|ing arts)?)\b/.test(text)) tags.add("music");
  if (/\b(business|entrepreneur|startup|enterprise|finance|accounting|marketing|management|trade)\b/.test(text)) tags.add("business");
  if (/\b(education|course|training|scholarship|fellowship|research|student|university|learning)\b/.test(text)) tags.add("education");
  if (/\b(health|wellbeing|wellness|medical|public health|mental health|nutrition)\b/.test(text)) tags.add("health");
  if (/\b(environment|climate|conservation|sustainab|agriculture|wildlife|energy)\b/.test(text)) tags.add("environment");
  if (/\b(public service|government|civil service|governance|diplomacy|election)\b/.test(text)) tags.add("public-service");
  if (!tags.size) tags.add("other");
  return tags;
}

function opportunityKind(item: FeedItem) {
  const text = `${item.title} ${item.description} ${item.categories.join(" ")}`.toLowerCase();
  if (/scholarship|bursary|fellowship/.test(text)) return "Scholarship / fellowship";
  if (/grant|funding|prize/.test(text)) return "Grant / funding";
  if (/course|training|bootcamp|workshop|class/.test(text)) return "Course / training";
  if (/internship|attachment|trainee|apprentice/.test(text)) return "Internship / placement";
  if (/\b(job|career|employment|position|vacancy|hiring)\b/.test(text)) return "Job / career";
  if (/conference|competition|challenge|event|call for/.test(text)) return "Event / competition";
  return "Opportunity";
}

function courseSearchQuery(category: string) {
  const label = interests.find(([value]) => value === category)?.[1] ?? "all interests";
  return category === "all" ? "free online courses" : `free ${label.toLowerCase()} online courses`;
}

function displayDate(value: string | null) {
  if (!value) return "Date not supplied";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not supplied" : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export default function CareerResearchPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("Opportunities for Youth (third-party aggregator)");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const refresh = async () => {
    if (!supabase) { setError("The opportunities feed is not connected to Supabase."); return; }
    setLoading(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<FeedResponse>("career-opportunities");
      if (invokeError) throw new Error(invokeError.message || "The public feed could not be reached.");
      if (!data || data.error) throw new Error(data?.error || "The public feed returned no usable data.");
      setItems(Array.isArray(data.items) ? data.items : []);
      setSource(data.source || "Public opportunities feed");
      setNotice(data.notice || "");
      setUpdatedAt(data.updated_at || new Date().toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh current opportunities.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleItems = useMemo(() => items
    .filter((item) => category === "all" || interestTags(item).has(category))
    .filter((item) => !search.trim() || `${item.title} ${item.description} ${item.categories.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (Date.parse(b.published_at || "") || 0) - (Date.parse(a.published_at || "") || 0)), [items, category, search]);

  const edxUrl = `https://www.edx.org/courses?q=${encodeURIComponent(courseSearchQuery(category))}`;
  const speedycCourseUrl = "https://kenya.speedycourse.com/";
  const openLearnUrl = category === "creative" || category === "music"
    ? "https://www.open.edu/openlearn/history-the-arts/free-courses"
    : "https://www.open.edu/openlearn/";

  return <div className="career-desk">
    <header className="career-heading">
      <div>
        <div className="eyebrow">Career research desk</div>
        <h1>Find a next step.</h1>
        <p className="subheading">Browse learning and opportunities beyond tech—from law and business to the arts, music and singing. Filter by interest, then check the original provider’s details.</p>
      </div>
      <button type="button" className="secondary-button career-refresh" onClick={() => void refresh()} disabled={loading}>
        <RefreshCw size={15} className={loading ? "career-spin" : ""} /> {loading ? "Refreshing…" : "Refresh feed"}
      </button>
    </header>

    <section className="card card-pad career-controls" aria-label="Filter opportunities">
      <label className="career-filter-label">Interest
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {interests.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="career-search-label"><span>Search listings</span>
        <span className="career-search-input"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Scholarship, course, singing…" /></span>
      </label>
      <span className="career-result-count">{visibleItems.length} listing{visibleItems.length === 1 ? "" : "s"}</span>
    </section>

    <section className="card card-pad career-catalogues" aria-label="Learning catalogues">
      <div className="career-section-heading"><div><div className="section-label"><GraduationCap size={15} /> Free learning catalogues</div><p className="field-hint">These catalogues update on their providers’ sites. “Free” can mean audit access; certificates or full access may cost money.</p></div></div>
      <div className="career-catalogue-grid">
        <a className="career-catalogue" href={edxUrl} target="_blank" rel="noreferrer"><span className="career-tag">Free audit available</span><strong>edX courses</strong><span>Search the current catalog by interest. Course content can be audited for free; certificates and some features are paid.</span><span className="career-link">Browse catalog <ExternalLink size={13} /></span></a>
        <a className="career-catalogue" href={openLearnUrl} target="_blank" rel="noreferrer"><span className="career-tag">Free learning</span><strong>OpenLearn · The Open University</strong><span>Free short courses across subjects, including arts, music and law-related learning.</span><span className="career-link">Browse courses <ExternalLink size={13} /></span></a>
        <a className="career-catalogue" href={speedycCourseUrl} target="_blank" rel="noreferrer"><span className="career-tag">Kenya course directory</span><strong>SpeedyCourse Kenya</strong><span>Browse Kenyan provider listings across legal, creative, business and other fields. Prices vary; use its free-course section and confirm fees with providers.</span><span className="career-link">Browse providers <ExternalLink size={13} /></span></a>
      </div>
    </section>

    <section className="career-feed" aria-label="Current opportunities">
      <div className="career-feed-heading"><div><div className="section-label">Current opportunities</div><p className="field-hint">Auto-refreshed from a public RSS feed on open and every 30 minutes while this page stays open; use Refresh feed to check again.</p></div>{updatedAt && <span className="quiet">Updated {new Date(updatedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</span>}</div>
      {error && <div className="connection-error">{error} <button type="button" className="material-link" onClick={() => void refresh()}>Try again</button></div>}
      {!error && loading && items.length === 0 && <div className="card card-pad career-empty">Loading the latest public listings…</div>}
      {!error && !loading && visibleItems.length === 0 && <div className="card card-pad career-empty">No current feed items match this filter. Try another interest or refresh.</div>}
      <div className="career-opportunity-grid">{visibleItems.map((item) => {
        const tags = interestTags(item);
        return <article className="card card-pad career-opportunity" key={item.url}>
          <div className="career-meta"><span className="career-tag">{opportunityKind(item)}</span><span>{displayDate(item.published_at)}</span></div>
          <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h2>
          <p>{item.description || "Open the listing for full details."}</p>
          <div className="career-tags">{[...tags].slice(0, 4).map((tag) => <span className="career-interest" key={tag}>{interests.find(([value]) => value === tag)?.[1] ?? tag}</span>)}</div>
          {item.categories.length > 0 && <small className="career-feed-category">Feed labels: {item.categories.slice(0, 3).join(" · ")}</small>}
          <a className="career-link" href={item.url} target="_blank" rel="noreferrer">Open listing <ExternalLink size={13} /></a>
        </article>;
      })}</div>
      {items.length > 0 && <p className="field-hint career-source-note">Source: {source}. {notice}</p>}
    </section>
  </div>;
}
