import { useEffect, useMemo, useState } from "react";
import { askAI } from "./lib/ai";
import { Markdown } from "./Markdown";
import { supabase } from "./data/repository";

type Path = { id: string; title: string; description: string; audience: string; steps: { title: string; skill: string }[] };
type Score = { skill: string; score: number; attempts: number };
const skills = ["Legal knowledge", "Legal writing", "Research", "Oral advocacy", "Communication"];

export default function GrowthPage({ userId, onOpenArena }: { userId: string | null; onOpenArena: () => void }) {
  const [paths, setPaths] = useState<Path[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [earned, setEarned] = useState<string[]>([]);
  const [selected, setSelected] = useState<Path | null>(null);
  const [step, setStep] = useState(0);
  const [speech, setSpeech] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!supabase || !userId) return;
    const [p, s, a] = await Promise.all([
      supabase.from("learning_paths").select("id,title,description,audience,steps").order("title"),
      supabase.from("skill_scores").select("skill,score,attempts").eq("user_id", userId),
      supabase.from("user_achievements").select("achievement_id").eq("user_id", userId),
    ]);
    setPaths((p.data as Path[] | null) ?? []); setScores((s.data as Score[] | null) ?? []); setEarned((a.data ?? []).map((x: { achievement_id: string }) => x.achievement_id));
  };
  useEffect(() => { void load(); }, [userId]);
  const scoreFor = (skill: string) => scores.find((x) => x.skill === skill)?.score ?? 0;
  const completeStep = async () => {
    if (!supabase || !userId || !selected) return;
    const next = Math.min(step + 1, selected.steps.length);
    await supabase.from("path_progress").upsert({ user_id: userId, path_id: selected.id, current_step: next, completed_steps: Array.from({ length: next }, (_, i) => i), completed_at: next === selected.steps.length ? new Date().toISOString() : null }, { onConflict: "user_id,path_id" });
    setStep(next);
  };
  const judgeSpeech = async () => {
    if (!speech.trim() || busy) return;
    setBusy(true); setFeedback("");
    try {
      const r = await askAI({ feature: "moot_judge", mode: "general", messages: [{ role: "user", content: `Review this spoken practice submission. Give only one strength, one high-impact improvement, one delivery drill, and one question for me to answer next. Flag repetition, filler, generic or AI-like wording as signals, not proof. Submission:\n${speech}` }] });
      setFeedback(r.answer);
      if (supabase && userId) await supabase.from("study_sessions").insert({ user_id: userId, mode: "oral-practice", subject: "Oral advocacy", minutes: 5, metadata: { submission_length: speech.length } });
    } catch (e) { setFeedback(e instanceof Error ? e.message : "Feedback unavailable."); } finally { setBusy(false); }
  };
  const pathProgress = useMemo(() => selected ? `${step}/${selected.steps.length}` : "", [selected, step]);
  return <>
    <div className="page-heading"><div><div className="eyebrow">Your development</div><h1>Growth studio.</h1><p className="subheading">Build knowledge, writing, research, communication and advocacy one deliberate step at a time.</p></div></div>
    <div className="growth-grid">
      <div className="card card-pad"><div className="card-header"><span className="section-label">Skill analytics</span><span className="quiet">Updated from practice</span></div>{skills.map((skill) => <div className="skill-row" key={skill}><div><strong>{skill}</strong><span>{scoreFor(skill)}%</span></div><div className="progress"><span style={{ width: `${scoreFor(skill)}%` }} /></div></div>)}</div>
    <div className="card card-pad"><div className="card-header"><span className="section-label">Achievements</span><span className="quiet">{earned.length} earned</span></div><p className="field-hint">Earn milestones through recall, paths and oral practice. Keep improving rather than chasing perfection.</p><div className="achievement-strip">{earned.length ? earned.map((id) => <span className="chip" key={id}>{id.replace(/-/g, " ")}</span>) : <span className="quiet">Your first milestone is waiting.</span>}</div></div>
    </div>
    <div className="card card-pad growth-section"><div className="card-header"><span className="section-label">Guided learning paths</span><span className="quiet">Unlock one step at a time</span></div><div className="path-grid">{paths.map((path) => <button className={`path-card ${selected?.id === path.id ? "active" : ""}`} key={path.id} onClick={() => { setSelected(path); setStep(0); }}><strong>{path.title}</strong><span>{path.description}</span><small>{path.audience} · {path.steps.length} steps</small></button>)}</div>{selected && <div className="path-active"><div className="eyebrow">Step {pathProgress}</div><h2>{selected.steps[step]?.title ?? "Path complete"}</h2><p className="field-hint">Skill: {selected.steps[step]?.skill ?? "Mastery"}. Complete this practically, then mark it done to unlock the next step.</p>{step < selected.steps.length ? <button className="primary-button" onClick={() => void completeStep()}>Complete step</button> : <span className="chip">Completed</span>}</div>}</div>
    <div className="card card-pad growth-section"><div className="card-header"><div><span className="section-label">Oral practice lab</span><p className="subheading">Paste or dictate a short submission, then receive one focused correction instead of a full rewrite.</p></div><button className="secondary-button" onClick={onOpenArena}>Open Arena</button></div><textarea className="oral-input" rows={5} value={speech} onChange={(e) => setSpeech(e.target.value)} placeholder="Madam Speaker / My Lords, the issue before the court is…" /><button className="primary-button" onClick={() => void judgeSpeech()} disabled={busy}>{busy ? "Reviewing…" : "Review my delivery"}</button>{feedback && <div className="practice-answer"><Markdown text={feedback} /></div>}</div>
  </>;
}
