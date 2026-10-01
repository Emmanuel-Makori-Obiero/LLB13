import { useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, Mic, Play, Square, Video } from "lucide-react";
import { askAI, listMyMaterials, type AIResult } from "./lib/ai";
import { Markdown } from "./Markdown";
import "./learning-studio.css";

type Doc = { id: string; title: string; scope: string };
type Mode = "podcast" | "video";

const perspectives = [
  "Act as a careful Kenyan law lecturer. Identify the governing rule, authorities, reasoning, and any uncertainty in the selected source.",
  "Act as a plain-language tutor. Explain the selected topic with a concrete everyday example, likely confusion, and a quick recall question.",
  "Act as a demanding moot coach. Test the strongest argument, counterargument, application, exam traps, and what a student must verify before relying on it.",
];

function speakable(text: string) {
  return text.replace(/[#*_`>\[\]]/g, "").replace(/\(verify\)/gi, "verify").replace(/\s+/g, " ").trim();
}

export default function LearningStudio() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<Mode>("podcast");
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const [script, setScript] = useState("");
  const [playing, setPlaying] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => { void listMyMaterials().then((items) => setDocs(items as Doc[])).catch(() => setError("Could not load your AI-ready documents.")); }, []);
  const selectedDocs = useMemo(() => docs.filter((doc) => selected.includes(doc.id)), [docs, selected]);
  const pages = useMemo(() => script.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean), [script]);

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-6));
  const download = () => {
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${(topic || "law-lesson").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`; link.click(); URL.revokeObjectURL(url);
  };
  const play = () => {
    if (!script || !("speechSynthesis" in window)) return;
    if (playing) { window.speechSynthesis.cancel(); setPlaying(false); return; }
    const utterance = new SpeechSynthesisUtterance(speakable(script));
    utterance.lang = "en-KE"; utterance.rate = 0.9; utterance.pitch = 0.98;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => /en[-_]KE/i.test(voice.lang)) ?? voices.find((voice) => /en[-_](GB|AU|US)/i.test(voice.lang)) ?? null;
    utterance.onend = () => setPlaying(false); window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); setPlaying(true);
  };

  const generate = async () => {
    if (!topic.trim() || !selected.length || working) return;
    setWorking(true); setError(""); setPanel([]); setScript(""); setSlide(0);
    try {
      const findings: string[] = [];
      for (let index = 0; index < perspectives.length; index += 1) {
        setStage(`AI perspective ${index + 1} of ${perspectives.length}…`);
        const result = await askAI({ feature: "topic_summary", mode: "auto", docIds: selected, messages: [{ role: "user", content: `${perspectives[index]}\n\nTopic: ${topic.trim()}\nReturn a focused memo for a later script editor. Do not invent authorities.` }] });
        findings.push(result.answer);
      }
      setPanel(findings);
      setStage(mode === "podcast" ? "Editing the two-speaker episode…" : "Editing the narrated video lesson…");
      const editor = await askAI({ feature: mode === "podcast" ? "podcast_script" : "video_script", mode: "auto", docIds: selected, messages: [{ role: "user", content: `Topic: ${topic.trim()}\n\nIndependent research memos from the AI panel:\n${findings.map((item, i) => `MEMO ${i + 1}\n${item}`).join("\n\n")}\n\nCreate the final ${mode} now. Keep it faithful to the selected sources, cite source markers when available, and mark uncertain law for verification.` }] });
      setScript(editor.answer);
    } catch (e) { setError(e instanceof Error ? e.message : "The learning studio is unavailable."); }
    finally { setWorking(false); setStage(""); }
  };

  return <section className="learning-studio card card-pad">
    <div className="card-header"><div><div className="section-label">Notebook-style learning studio</div><h2>Turn a topic into a conversation.</h2><p className="subheading">Three independent perspectives, one source-grounded editor, then a listenable podcast or narrated lesson.</p></div><BookOpen size={20} /></div>
    <div className="studio-grid">
      <div>
        <label className="data-form"><span>Topic or question</span><input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Why was criminal defamation unconstitutional in Okuta?" /></label>
        <div className="studio-mode"><button className={mode === "podcast" ? "active" : ""} onClick={() => setMode("podcast")}><Mic size={15} /> Two-speaker podcast</button><button className={mode === "video" ? "active" : ""} onClick={() => setMode("video")}><Video size={15} /> Narrated video lesson</button></div>
        <button className="primary-button studio-generate" onClick={() => void generate()} disabled={working || !topic.trim() || !selected.length}>{working ? <><Loader2 size={14} className="studio-spin" /> {stage}</> : "Build learning episode"}</button>
        {error && <div className="connection-error" style={{ marginTop: 12 }}>{error}</div>}
        {script && <div className="studio-output"><div className="studio-output-head"><div><span className="section-label">Final {mode === "podcast" ? "podcast script" : "video lesson"}</span><p className="field-hint">Generated from {selectedDocs.map((doc) => doc.title).join(", ")}</p></div><div className="studio-output-actions"><button className="secondary-button" onClick={play}>{playing ? <><Square size={13} /> Stop</> : <><Play size={13} /> Listen</>}</button><button className="secondary-button" onClick={download}>Download script</button></div></div>{mode === "video" && <div className="studio-slide"><span>Scene {Math.min(slide + 1, Math.max(1, pages.length))}</span><p>{pages[slide] || script}</p><div><button className="secondary-button" onClick={() => setSlide((value) => Math.max(0, value - 1))}>Previous</button><button className="secondary-button" onClick={() => setSlide((value) => Math.min(Math.max(0, pages.length - 1), value + 1))}>Next</button></div></div>}<div className="studio-markdown"><Markdown text={script} /></div></div>}
      </div>
      <aside className="studio-sources"><div className="section-label">Choose source books</div><p className="field-hint">The panel will only use selected AI-ready documents.</p>{docs.length === 0 ? <div className="empty">Upload a PDF, Word file, or text document in Study assistant first.</div> : docs.map((doc) => <label className={`studio-doc ${selected.includes(doc.id) ? "on" : ""}`} key={doc.id}><input type="checkbox" checked={selected.includes(doc.id)} onChange={() => toggle(doc.id)} /><span>{doc.title}</span></label>)}</aside>
    </div>
    {panel.length > 0 && <details className="studio-panel"><summary>Show the {panel.length} independent research memos</summary>{panel.map((memo, index) => <div key={index}><strong>Perspective {index + 1}</strong><Markdown text={memo} /></div>)}</details>}
  </section>;
}
