import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, GraduationCap, Library, PenLine, RefreshCw, Sparkles, Workflow } from "lucide-react";
import { askAI } from "./lib/ai";
import { Markdown } from "./Markdown";
import { supabase } from "./data/repository";
import { CounsellorChat } from "./CounsellorChat";
import "./growth.css";

type Path = { id: string; title: string; description: string; audience: string; steps: { title: string; skill: string }[] };
type Score = { skill: string; score: number; attempts: number };
type ActivityEvent = { id: number; event_type: string; page: string | null; created_at: string };
type GrowthPageProps = {
  userId: string | null;
  onOpenArena: () => void;
  onNavigate: (page: string) => void;
  onOpenMainAssistant: () => void;
};

const skills = ["Legal knowledge", "Legal writing", "Research", "Oral advocacy", "Communication"];
const hubLinks = [
  { page: "timetable", label: "Timetable", detail: "Plan classes and check-ins", icon: CalendarDays },
  { page: "library", label: "Library", detail: "Read course materials", icon: Library },
  { page: "cases", label: "Case law", detail: "Search Kenyan judgments", icon: BookOpen },
  { page: "research", label: "Research writer", detail: "Draft, cite or learn a style", icon: PenLine },
  { page: "guide", label: "Guided study", detail: "Follow a lesson path", icon: GraduationCap },
  { page: "opportunities", label: "Career research", detail: "Courses, grants and opportunities", icon: ArrowRight },
  { page: "assistant", label: "Study assistant & podcasts", detail: "Ask, revise or make a class episode", icon: Sparkles },
  { page: "assignments", label: "Assignments", detail: "Track work and deadlines", icon: Workflow },
];

const pageNames: Record<string, string> = {
  library: "the Library",
  cases: "Case Law",
  research: "Research Writer",
  assistant: "Study Assistant & Learning Studio",
  timetable: "the Timetable",
  guide: "Guided Study",
  assignments: "Assignments",
  growth: "Growth Studio",
  opportunities: "Career Research",
};

function activityLabel(event: ActivityEvent) {
  if (event.event_type === "page_view") return `Viewed ${pageNames[event.page ?? ""] ?? event.page ?? "a platform page"}`;
  if (event.event_type === "podcast_script_generated") return "Generated a podcast script";
  if (event.event_type === "podcast_audio_generated") return "Generated podcast audio";
  if (event.event_type === "podcast_audio_failed") return "Podcast audio generation failed";
  return event.event_type.replace(/_/g, " ");
}

export default function GrowthPage({ userId, onOpenArena, onNavigate, onOpenMainAssistant }: GrowthPageProps) {
  const [paths, setPaths] = useState<Path[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [earned, setEarned] = useState<string[]>([]);
  const [selected, setSelected] = useState<Path | null>(null);
  const [step, setStep] = useState(0);
  const [speech, setSpeech] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    const [pathResult, scoreResult, achievementResult, activityResult] = await Promise.all([
      supabase.from("learning_paths").select("id,title,description,audience,steps").order("title"),
      supabase.from("skill_scores").select("skill,score,attempts").eq("user_id", userId),
      supabase.from("user_achievements").select("achievement_id").eq("user_id", userId),
      supabase.from("platform_activity_events").select("id,event_type,page,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
    ]);
    const failed = pathResult.error || scoreResult.error || achievementResult.error || activityResult.error;
    if (failed) {
      setLoadError("Some progress metrics or your recent activity could not refresh. Try again shortly.");
      return;
    }
    setLoadError("");
    setPaths((pathResult.data as Path[] | null) ?? []);
    setScores((scoreResult.data as Score[] | null) ?? []);
    setEarned((achievementResult.data ?? []).map((item: { achievement_id: string }) => item.achievement_id));
    setActivity((activityResult.data as ActivityEvent[] | null) ?? []);
    setUpdatedAt(Date.now());
  }, [userId]);

  useEffect(() => {
    void load();
    if (!supabase || !userId) return;
    let active = true;
    const refresh = () => { if (active) void load(); };
    const channel = supabase.channel(`growth-progress-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "skill_scores", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_achievements", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "path_progress", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_activity_events", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      if (supabase) void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  const scoreFor = (skill: string) => scores.find((item) => item.skill === skill)?.score ?? 0;
  const completeStep = async () => {
    if (!supabase || !userId || !selected) return;
    const next = Math.min(step + 1, selected.steps.length);
    const { error } = await supabase.from("path_progress").upsert({
      user_id: userId,
      path_id: selected.id,
      current_step: next,
      completed_steps: Array.from({ length: next }, (_, index) => index),
      completed_at: next === selected.steps.length ? new Date().toISOString() : null,
    }, { onConflict: "user_id,path_id" });
    if (error) { setLoadError("Could not save this learning-path step. Please try again."); return; }
    setStep(next);
    void load();
  };

  const judgeSpeech = async () => {
    if (!speech.trim() || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const result = await askAI({
        feature: "moot_judge",
        mode: "general",
        messages: [{ role: "user", content: `Review this spoken practice submission. Give only one strength, one high-impact improvement, one delivery drill, and one question for me to answer next. Flag repetition, filler, generic or AI-like wording as signals, not proof. Submission:\n${speech}` }],
      });
      setFeedback(result.answer);
      if (supabase && userId) await supabase.from("study_sessions").insert({ user_id: userId, mode: "oral-practice", subject: "Oral advocacy", minutes: 5, metadata: { submission_length: speech.length } });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Feedback unavailable.");
    } finally { setBusy(false); }
  };

  const pathProgress = useMemo(() => selected ? `${step}/${selected.steps.length}` : "", [selected, step]);

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">Your development</div>
        <h1>Growth studio.</h1>
        <p className="subheading">Build knowledge, writing, research, communication and advocacy one deliberate step at a time. Your progress refreshes when the platform reports changes and every minute while this page is open.</p>
      </div>
      <button type="button" className="secondary-button" onClick={() => void load()}><RefreshCw size={14} /> Refresh progress</button>
    </div>

    <div className="growth-grid">
      <div className="card card-pad">
        <div className="card-header"><span className="section-label">Skill analytics</span><span className="quiet">{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}` : "Waiting for progress"}</span></div>
        {skills.map((skill) => <div className="skill-row" key={skill}><div><strong>{skill}</strong><span>{scoreFor(skill)}%</span></div><div className="progress"><span style={{ width: `${Math.max(0, Math.min(100, scoreFor(skill)))}%` }} /></div></div>)}
      </div>
      <div className="card card-pad">
        <div className="card-header"><span className="section-label">Achievements</span><span className="quiet">{earned.length} earned</span></div>
        <p className="field-hint">Earn milestones through recall, paths and oral practice. Keep improving rather than chasing perfection.</p>
        <div className="achievement-strip">{earned.length ? earned.map((id) => <span className="chip" key={id}>{id.replace(/-/g, " ")}</span>) : <span className="quiet">Your first milestone is waiting.</span>}</div>
        {loadError && <p className="field-hint" role="status">{loadError}</p>}
      </div>
    </div>

    <div className="card card-pad growth-section">
      <div className="card-header"><span className="section-label">Recent activity</span><span className="quiet">Live updates · your account only</span></div>
      <p className="field-hint">A short record of page visits and podcast actions. Prompts, document contents and private chat messages are not included.</p>
      <div className="growth-activity-list" aria-live="polite">
        {activity.length ? activity.map((event) => <div className="growth-activity" key={event.id}><strong>{activityLabel(event)}</strong><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</time></div>) : <span className="quiet">No recent activity recorded yet.</span>}
      </div>
    </div>

    <div className="card card-pad growth-section">
      <div className="card-header"><span className="section-label">One hub, connected to your work</span><span className="quiet">Open any study area</span></div>
      <div className="growth-links">{hubLinks.map(({ page, label, detail, icon: Icon }) => <button className="growth-link" type="button" key={page} onClick={() => onNavigate(page)}><Icon size={17} /><span><strong>{label}</strong><small>{detail}</small></span><ArrowRight size={14} /></button>)}</div>
    </div>

    <div className="card card-pad growth-section">
      <div className="card-header"><span className="section-label">Guided learning paths</span><span className="quiet">Unlock one step at a time</span></div>
      {paths.length ? <div className="path-grid">{paths.map((path) => <button className={`path-card ${selected?.id === path.id ? "active" : ""}`} key={path.id} onClick={() => { setSelected(path); setStep(0); }}><strong>{path.title}</strong><span>{path.description}</span><small>{path.audience} · {path.steps.length} steps</small></button>)}</div> : <p className="field-hint">No guided learning paths are available yet.</p>}
      {selected && <div className="path-active"><div className="eyebrow">Step {pathProgress}</div><h2>{selected.steps[step]?.title ?? "Path complete"}</h2><p className="field-hint">Skill: {selected.steps[step]?.skill ?? "Mastery"}. Complete this practically, then mark it done to unlock the next step.</p>{step < selected.steps.length ? <button className="primary-button" onClick={() => void completeStep()}>Complete step</button> : <span className="chip">Completed</span>}</div>}
    </div>

    <div className="card card-pad growth-section">
      <div className="card-header"><div><span className="section-label">Oral practice lab</span><p className="subheading">Paste or dictate a short submission, then receive one focused correction instead of a full rewrite.</p></div><button className="secondary-button" onClick={onOpenArena}>Open Arena</button></div>
      <textarea className="oral-input" rows={5} value={speech} onChange={(event) => setSpeech(event.target.value)} placeholder="Madam Speaker / My Lords, the issue before the court is…" />
      <button className="primary-button" onClick={() => void judgeSpeech()} disabled={busy}>{busy ? "Reviewing…" : "Review my delivery"}</button>
      {feedback && <div className="practice-answer"><Markdown text={feedback} /></div>}
    </div>

    <div className="card card-pad growth-section growth-wellbeing">
      <div className="card-header"><div><span className="section-label">Wellbeing check-in</span><p className="subheading">Talk through study stress, routines or how you are feeling. This AI is supportive, but it is not a clinician.</p><p className="field-hint">Open the main Lawyer Agent in a separate thread. This wellbeing history is not copied automatically; share only what you choose.</p></div><button className="secondary-button" type="button" onClick={onOpenMainAssistant}>Open main Lawyer Agent</button></div>
      <CounsellorChat storageKey={userId ? `g13.growth-wellbeing.${userId}` : undefined} />
      <p className="field-hint">If you are in immediate danger, contact a trusted person or local emergency help. In Kenya, emergency numbers are 999 or 112; the Kenya Red Cross helpline is 1199.</p>
    </div>
  </>;
}
