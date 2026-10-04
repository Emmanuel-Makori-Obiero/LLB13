import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Search, ShieldCheck } from "lucide-react";
import { featureCatalog } from "./data/featureCatalog";
import type { FeatureEntry } from "./data/featureCatalog";
import "./features-guide.css";

const availabilityLabel: Record<FeatureEntry["availability"], string> = {
  live: "In the hub",
  partial: "Setup or limits apply",
  new: "New",
};

function categoryId(category: string) {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function FeaturesGuidePage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All features");
  const [availability, setAvailability] = useState("all");
  const categories = useMemo(
    () => ["All features", ...new Set(featureCatalog.map((feature) => feature.category))],
    [],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return featureCatalog.filter((feature) => {
      const matchesCategory = category === "All features" || feature.category === category;
      const matchesAvailability = availability === "all" || feature.availability === availability;
      const searchable = [
        feature.title,
        feature.category,
        feature.access,
        feature.benefit,
        feature.howToUse,
        ...feature.capabilities,
      ].join(" ").toLowerCase();
      return matchesCategory && matchesAvailability && (!term || searchable.includes(term));
    });
  }, [availability, category, query]);
  const visibleCategories = categories.filter((item) =>
    item !== "All features" && filtered.some((feature) => feature.category === item),
  );

  return (
    <main className="features-guide-page" id="top">
      <header className="fg-header">
        <a className="fg-brand" href="/" aria-label="Group 13 home">
          <span className="fg-brand-mark">13</span>
          <span><strong>GROUP 13</strong><small>LAW SCHOOL HUB</small></span>
        </a>
        <nav className="fg-nav" aria-label="Public navigation">
          <a href="/">Home</a>
          <a href="#feature-list">Features</a>
          <a href="/cases">Case law</a>
          <a href="/login" className="fg-login">Sign in</a>
          <a href="/signup" className="fg-signup">Create account <ArrowRight size={14} /></a>
        </nav>
      </header>

      <section className="fg-hero" aria-labelledby="fg-title">
        <div className="fg-hero-meta"><span>THE GROUP 13 STUDY SYSTEM</span><span>{featureCatalog.length} FEATURE AREAS</span></div>
        <div className="fg-hero-copy">
          <span className="fg-kicker"><BookOpen size={14} /> A CLEAR GUIDE TO WHAT'S INSIDE</span>
          <h1 id="fg-title">Every tool.<br /><strong>Its purpose. Your next step.</strong></h1>
          <p>Browse the full platform before you sign in. See what each feature does, how to use it, who can access it, and where setup or limits still apply.</p>
          <a className="fg-primary" href="#feature-list">Explore the features <ArrowRight size={16} /></a>
        </div>
        <aside className="fg-hero-note"><ShieldCheck size={18} /><span><strong>No login needed.</strong> Some workspace tools require an approved Group 13 account.</span></aside>
      </section>

      <section className="fg-directory" id="feature-list" aria-label="Feature directory">
        <div className="fg-directory-heading">
          <div><span className="fg-kicker">THE DIRECTORY</span><h2>Find your way around.</h2></div>
          <span className="fg-result-count">{filtered.length} of {featureCatalog.length} shown</span>
        </div>

        <div className="fg-controls">
          <label className="fg-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search features, tasks or topics" aria-label="Search all features" /></label>
          <label className="fg-filter-label">Availability
            <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
              <option value="all">All states</option>
              <option value="live">In the hub</option>
              <option value="partial">Setup or limits apply</option>
              <option value="new">New</option>
            </select>
          </label>
        </div>
        <div className="fg-category-list" role="group" aria-label="Filter by feature area">
          {categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
        </div>

        {filtered.length === 0 ? <div className="fg-no-results"><strong>No features match that search.</strong><button type="button" onClick={() => { setQuery(""); setCategory("All features"); setAvailability("all"); }}>Clear filters</button></div> : visibleCategories.map((group) => {
          const entries = filtered.filter((feature) => feature.category === group);
          return (
            <section className="fg-category" key={group} id={categoryId(group)}>
              <header className="fg-category-heading"><span>{String(categories.indexOf(group)).padStart(2, "0")}</span><h2>{group}</h2><span>{entries.length} {entries.length === 1 ? "feature" : "features"}</span></header>
              <div className="fg-feature-list">
                {entries.map((feature, index) => (
                  <article className="fg-feature" key={feature.id}>
                    <div className="fg-feature-top">
                      <span className="fg-feature-number">{String(index + 1).padStart(2, "0")}</span>
                      <div className="fg-feature-main">
                        <div className="fg-feature-title-line"><h3>{feature.title}</h3><span className={`fg-status fg-status-${feature.availability}`}>{availabilityLabel[feature.availability]}</span></div>
                        <p className="fg-benefit"><strong>Why it helps</strong>{feature.benefit}</p>
                      </div>
                    </div>
                    <details className="fg-details">
                      <summary>How it works and how to use it</summary>
                      <div className="fg-detail-grid">
                        <section><h4>What it includes</h4><ul>{feature.capabilities.map((capability, capabilityIndex) => <li key={`${feature.id}-${capabilityIndex}`}>{capability}</li>)}</ul></section>
                        <section><h4>How to use it</h4><p>{feature.howToUse}</p><h4>Who can use it</h4><p>{feature.access}</p></section>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </section>

      <aside className="fg-caution"><span className="fg-caution-mark">13</span><p><strong>Kenyan law starts with the Constitution.</strong> Case citations require selected AI-readable source text; use the Kenya Law case finder to open official judgments. Features marked “Setup or limits apply” may depend on account access, provider configuration or a current limitation.</p></aside>
      <footer className="fg-footer"><a className="fg-brand" href="/"><span className="fg-brand-mark">13</span><span><strong>GROUP 13</strong><small>LAW SCHOOL HUB</small></span></a><span>Read closely · Think boldly · Verify the source</span><a href="#top">Back to top ↑</a></footer>
    </main>
  );
}
