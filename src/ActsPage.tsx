import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, BookOpen, Download, FileUp, Loader2, Search, ScrollText, Trash2 } from "lucide-react";
import { extractText } from "./lib/ai";
import { supabase } from "./data/repository";
import seedAct from "./data/judicature-act.json";
import "./constitution.css";
import "./acts.css";

type ActSection = { number: number; title: string; text: string };
type ActSchedule = { number: string; title: string; text: string };
type Act = { id: string; title: string; shortTitle: string; chapter: string; edition: string; source: string; sourceUrl: string; assentDate: string; commencementDate: string; preamble: string; sections: ActSection[]; schedules: ActSchedule[]; created_by?: string };
const seeded = seedAct as Act;
const bookmarksKey = "llb13-act-bookmarks-v1";

function readBookmarks(): Record<string, number[]> {
  try { const value = JSON.parse(localStorage.getItem(bookmarksKey) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; }
}
function parseUploadedAct(raw: string, filename: string): Act {
  const text = raw.replace(/\r/g, "").replace(/\f/g, "\n").replace(/\n{3,}/g, "\n\n");
  const title = (text.match(/(?:THE|THE\s+)\s*([A-Z][A-Z\s]+ACT)/i)?.[1] || filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")).trim();
  const afterCommencement = text.search(/Date of commencement:/i);
  const startText = afterCommencement >= 0 ? text.slice(afterCommencement) : text;
  const firstSection = startText.search(/(?:^|\n)\s*1\.\s+[^\n]+/);
  const operative = firstSection >= 0 ? startText.slice(firstSection) : startText;
  const scheduleIndex = operative.search(/(?:^|\n)\s*SCHEDULES?\s*\n/i);
  const sectionsText = scheduleIndex >= 0 ? operative.slice(0, scheduleIndex) : operative;
  const scheduleText = scheduleIndex >= 0 ? operative.slice(scheduleIndex).replace(/^\s*SCHEDULES?\s*/i, "").trim() : "";
  const markers = [...sectionsText.matchAll(/(?:^|\n)\s*(\d{1,3})\.\s+([^\n]+)\n/g)];
  const sections = markers.map((marker, index) => ({ number: Number(marker[1]), title: marker[2].trim(), text: sectionsText.slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? sectionsText.length).trim() }));
  const assentDate = text.match(/Date of assent:\s*([^\]\n]+)/i)?.[1]?.trim() || "";
  const commencementDate = text.match(/Date of commencement:\s*([^\]\n]+)/i)?.[1]?.trim() || "";
  return { id: `uploaded-${Date.now()}`, title: title || "Uploaded Act", shortTitle: title || "Uploaded Act", chapter: text.match(/CHAPTER\s+([\w-]+)/i)?.[1] ? `Chapter ${text.match(/CHAPTER\s+([\w-]+)/i)![1]}` : "", edition: text.match(/Revised Edition[^\n]*/i)?.[0]?.trim() || "Uploaded edition", source: `Uploaded by administrator · ${filename}`, sourceUrl: "", assentDate, commencementDate, preamble: text.match(/An Act of Parliament to[\s\S]{0,800}?\.(?=\n\s*\[Act|\n\s*\d+\.)/i)?.[0]?.trim() || "", sections, schedules: scheduleText ? [{ number: "Schedule", title: "Schedule", text: scheduleText }] : [] };
}

export default function ActsPage({ isAdmin }: { isAdmin: boolean }) {
  const [acts, setActs] = useState<Act[]>([seeded]);
  const [selectedActId, setSelectedActId] = useState(seeded.id);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(readBookmarks);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedAct = acts.find((act) => act.id === selectedActId) ?? acts[0];

  const loadActs = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("acts").select("id,title,short_title,chapter,edition,source,source_url,assent_date,commencement_date,preamble,sections,schedules,created_by").order("updated_at", { ascending: false }).limit(100);
    if (error) { setMessage(`Could not load saved Acts: ${error.message}`); return; }
    const remote = (data ?? []).map((row) => ({ id: row.id, title: row.title, shortTitle: row.short_title, chapter: row.chapter, edition: row.edition, source: row.source, sourceUrl: row.source_url, assentDate: row.assent_date, commencementDate: row.commencement_date, preamble: row.preamble, sections: row.sections, schedules: row.schedules, created_by: row.created_by })) as Act[];
    setActs([seeded, ...remote.filter((act) => act.title !== seeded.title)]);
  };
  useEffect(() => { void loadActs(); }, []);

  const normalized = query.trim().toLowerCase();
  const matchingSections = useMemo(() => normalized ? selectedAct.sections.filter((section) => `${section.number} ${section.title} ${section.text}`.toLowerCase().includes(normalized)) : selectedAct.sections, [normalized, selectedAct]);
  const section = selectedSection === null ? null : selectedAct.sections.find((item) => item.number === selectedSection) ?? null;
  const bookmarks = saved[selectedAct.id] ?? [];
  const toggleSaved = (number: number) => { const next = bookmarks.includes(number) ? bookmarks.filter((value) => value !== number) : [...bookmarks, number].sort((a, b) => a - b); const all = { ...saved, [selectedAct.id]: next }; setSaved(all); localStorage.setItem(bookmarksKey, JSON.stringify(all)); };
  const selectSection = (item: ActSection) => { setSelectedSection(item.number); setSelectedSchedule(null); };
  const resetSelection = () => { setSelectedSection(null); setSelectedSchedule(null); };
  const addAct = async (file?: File) => {
    if (!file || !supabase) return;
    setBusy(true); setMessage("Extracting sections from the Act…");
    try {
      const text = (await extractText(file)).trim();
      if (!text) throw new Error("No readable text was found. Upload a text-based PDF or a clear scanned PDF.");
      const parsed = parseUploadedAct(text, file.name);
      if (!parsed.sections.length) throw new Error("No numbered sections were detected. Check the Act’s formatting and try again.");
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Please sign in again before adding an Act.");
      const { data, error } = await supabase.from("acts").insert({ title: parsed.title, short_title: parsed.shortTitle, chapter: parsed.chapter, edition: parsed.edition, source: parsed.source, source_url: parsed.sourceUrl, assent_date: parsed.assentDate, commencement_date: parsed.commencementDate, preamble: parsed.preamble, sections: parsed.sections, schedules: parsed.schedules, created_by: user.user.id }).select("id,title,short_title,chapter,edition,source,source_url,assent_date,commencement_date,preamble,sections,schedules,created_by").single();
      if (error) throw new Error(error.message);
      const savedAct = { id: data.id, title: data.title, shortTitle: data.short_title, chapter: data.chapter, edition: data.edition, source: data.source, sourceUrl: data.source_url, assentDate: data.assent_date, commencementDate: data.commencement_date, preamble: data.preamble, sections: data.sections, schedules: data.schedules, created_by: data.created_by } as Act;
      setActs((current) => [savedAct, ...current.filter((act) => act.id !== savedAct.id)]); setSelectedActId(savedAct.id); resetSelection(); setMessage(`${savedAct.title} added with ${savedAct.sections.length} sections.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add the Act."); } finally { setBusy(false); }
  };
  const deleteAct = async (act: Act) => { if (!supabase || act.id === seeded.id || !window.confirm(`Delete ${act.title}?`)) return; const { error } = await supabase.from("acts").delete().eq("id", act.id); if (error) setMessage(error.message); else { setActs((current) => current.filter((item) => item.id !== act.id)); setSelectedActId(seeded.id); resetSelection(); setMessage("Act deleted."); } };

  return <div className="constitution-page acts-page"><header className="constitution-hero acts-hero"><div className="constitution-hero-mark" aria-hidden="true"><ScrollText size={27} /></div><div className="constitution-hero-copy"><p className="constitution-kicker">STATUTES OF KENYA</p><h1>Acts library</h1><p className="constitution-lede">Read Acts by section and Schedule. Each source remains arranged in its original order for careful legal study.</p><div className="constitution-source-badge">{acts.length} Act{acts.length === 1 ? "" : "s"} available</div></div>{selectedAct.sourceUrl && <a className="constitution-source-download" href={selectedAct.sourceUrl} download><Download size={16} /> Original PDF</a>}</header>
    <div className="constitution-notice" role="note"><strong>Study edition:</strong> Read the supplied or uploaded edition as arranged here. Always check the current official consolidated text before relying on an Act in practice.</div>
    {isAdmin && <section className="acts-admin card" aria-label="Add an Act"><div><p className="constitution-kicker">ADMINISTRATOR</p><h2>Add an Act</h2><p>Upload a readable PDF or document. The platform extracts numbered sections and schedules and saves the structured Act for members.</p></div><label className="primary-button acts-upload"><FileUp size={15} /> {busy ? <><Loader2 size={14} className="acts-spin" /> Extracting…</> : "Choose Act file"}<input type="file" accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void addAct(file); }} /></label>{message && <p className="acts-message">{message}</p>}</section>}
    <div className="acts-switcher">{acts.map((act) => <button type="button" className={act.id === selectedAct.id ? "is-active" : ""} key={act.id} onClick={() => { setSelectedActId(act.id); resetSelection(); setQuery(""); }}><BookOpen size={15} /><span><strong>{act.shortTitle || act.title}</strong><small>{act.chapter || act.edition}</small></span>{isAdmin && act.id !== seeded.id && <Trash2 size={14} onClick={(event) => { event.stopPropagation(); void deleteAct(act); }} />}</button>)}</div>
    <div className="constitution-workspace"><aside className="constitution-index" aria-label={`${selectedAct.title} contents`}><label className="constitution-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); resetSelection(); }} placeholder="Find a section or phrase" aria-label={`Search ${selectedAct.title}`} /></label><div className="constitution-index-toolbar"><span>CONTENTS · {selectedAct.sections.length} SECTIONS</span><span>{bookmarks.length} saved</span></div>{!normalized && <><button type="button" className={!section && !selectedSchedule ? "constitution-prelude is-active" : "constitution-prelude"} onClick={resetSelection}><span>Long title and dates</span><span className="constitution-count">Act overview</span></button><div className="constitution-chapter-list">{selectedAct.sections.map((item) => <button type="button" key={item.number} className={selectedSection === item.number ? "constitution-chapter is-active" : "constitution-chapter"} onClick={() => selectSection(item)}><span className="constitution-chapter-number">SECTION {item.number}</span><span className="constitution-chapter-title">{item.title}</span><span className="constitution-count">{item.text ? "Read provision" : "Deleted / spent"}</span></button>)}</div>{selectedAct.schedules.map((item) => <button type="button" className={selectedSchedule === item.number ? "constitution-schedule-link is-active" : "constitution-schedule-link"} key={item.number} onClick={() => { setSelectedSchedule(item.number); setSelectedSection(null); }}>{item.title}</button>)}</>}{normalized && <><p className="constitution-results-note">{matchingSections.length} matching section{matchingSections.length === 1 ? "" : "s"}</p>{matchingSections.map((item) => <button type="button" key={item.number} className={selectedSection === item.number ? "constitution-result is-active" : "constitution-result"} onClick={() => selectSection(item)}><span>Section {item.number}</span><strong>{item.title}</strong></button>)}</>}</aside>
      <main className="constitution-reader">{selectedSchedule ? <section className="constitution-reading"><button type="button" className="constitution-back" onClick={resetSelection}><ArrowLeft size={15} /> Contents</button><p className="constitution-kicker">SUPPLEMENTARY TEXT</p><h2>{selectedAct.schedules.find((item) => item.number === selectedSchedule)?.title}</h2><div className="constitution-verbatim">{selectedAct.schedules.find((item) => item.number === selectedSchedule)?.text}</div></section> : section ? <section className="constitution-reading"><button type="button" className="constitution-back" onClick={resetSelection}><ArrowLeft size={15} /> {selectedAct.shortTitle || selectedAct.title}</button><div className="constitution-article-head"><div><p className="constitution-kicker">{selectedAct.chapter || "ACT"}</p><h2>Section {section.number}</h2><h3>{section.title}</h3></div><button type="button" className={bookmarks.includes(section.number) ? "constitution-save is-saved" : "constitution-save"} onClick={() => toggleSaved(section.number)}><Bookmark size={18} fill={bookmarks.includes(section.number) ? "currentColor" : "none"} />{bookmarks.includes(section.number) ? "Saved" : "Save"}</button></div><div className="constitution-verbatim">{section.text || section.title}</div><div className="constitution-reading-footer">Verbatim structured text from: {selectedAct.edition || selectedAct.source}. Verify the current official edition before relying on it.</div></section> : normalized ? <section className="constitution-empty"><Search size={24} /><h2>{matchingSections.length ? "Choose a section" : "No matching sections"}</h2><p>{matchingSections.length ? "Select a result to read the complete provision." : "Try a section number, heading, or phrase from the Act."}</p></section> : <section className="constitution-reading"><p className="constitution-kicker">{selectedAct.chapter || "ACT"} · {selectedAct.edition}</p><h2>{selectedAct.title}</h2><h3>{selectedAct.shortTitle}</h3><div className="constitution-verbatim">{selectedAct.preamble || "No long title was captured in this edition."}</div><div className="acts-metadata"><span>Assent: {selectedAct.assentDate || "Not stated"}</span><span>Commencement: {selectedAct.commencementDate || "Not stated"}</span><span>{selectedAct.source}</span></div></section>}</main></div><footer className="constitution-attribution"><strong>Source and attribution</strong><span>{selectedAct.source}</span><span>{selectedAct.edition}</span><span>Acts are study materials, not legal advice.</span></footer></div>;
}
