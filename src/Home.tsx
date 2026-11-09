import { ArrowRight, BookOpen, CalendarDays, CheckSquare, FileText, Gavel, Library, MessageCircle, Sparkles, Users } from "lucide-react";
import type { Assignment, Lesson, Todo } from "./data/types";
import LearningLoop from "./LearningLoop";
import ClubPosterCarousel from "./ClubPosterCarousel";
import "./home-groups.css";
import "./daily-case-home.css";
type Props = { name: string; learnerLevel: string; learningPreference: string; lessons: Lesson[]; todos: Todo[]; assignments: Assignment[]; userId: string | null; unreadMessages: number; setPage: (id: string) => void };
const today = () => new Date().toISOString().slice(0, 10);
const hm = (t?: string | null) => (t ? t.slice(0, 5) : "");
const levelCopy: Record<string, { label: string; focus: string; next: string }> = {
  "llb-year-1": { label: "First year", focus: "Build a strong legal foundation", next: "Start with the key concepts, sources and facts in your current course. Ask for guided steps whenever a topic is new." },
  "llb-year-2": { label: "Second year", focus: "Connect rules with context", next: "Practise applying course rules to facts and connect legal questions with their social, political and economic setting." },
  "llb-year-3": { label: "Third year", focus: "Synthesize and communicate", next: "Work across supported authorities, consider national and wider legal contexts, and develop practical problem-solving." },
  "llb-year-4": { label: "Fourth year", focus: "Research and reason independently", next: "Build independent research, contextual analysis, effective communication and practice-ready problem-solving." },
  masters: { label: "Masters / LL.M.", focus: "Work at postgraduate depth", next: "Explore research questions, methodology, critical synthesis, and specialist materials." },
  phd: { label: "PhD / doctoral", focus: "Shape an original contribution", next: "Focus on literature mapping, research design, evidence, and original scholarly argument." },
};
const homeFeatureGroups = [
  { label: "Study", items: [{ id: "library", title: "Library", icon: Library }, { id: "daily-quiz", title: "Daily Quiz", icon: CheckSquare }, { id: "assistant", title: "Study assistant", icon: Sparkles }, { id: "guide", title: "Guided study", icon: BookOpen }] },
  { label: "Plan", items: [{ id: "timetable", title: "Timetable", icon: CalendarDays }, { id: "assignments", title: "Assignments", icon: FileText }, { id: "course-outline", title: "Course planner", icon: BookOpen }, { id: "todos", title: "My to-do", icon: CheckSquare }] },
  { label: "Practise", items: [{ id: "arena", title: "Games Hub", icon: Gavel }, { id: "exam-review", title: "Exam review", icon: FileText }, { id: "research", title: "Research writer", icon: Sparkles }, { id: "legal-process", title: "Legal what-ifs", icon: BookOpen }] },
  { label: "Community", items: [{ id: "groups", title: "Study groups", icon: Users }, { id: "discussions", title: "Discussions", icon: Users }, { id: "opportunities", title: "Career research", icon: ArrowRight }, { id: "leaderboard", title: "Leaderboard", icon: Gavel }] },
];
export default function Home({ name, learnerLevel, learningPreference, lessons, todos, assignments, userId, unreadMessages, setPage }: Props) {
  const t = today();
  const todayLessons = lessons.filter((l) => l.lesson_date === t);
  const next = lessons.filter((l) => l.lesson_date > t).slice(0, 3);
  const open = todos.filter((x) => !x.completed).slice(0, 4);
  const dueSoon = assignments.filter((a) => a.status !== "Completed").slice(0, 3);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const level = levelCopy[learnerLevel] ?? { label: "Law student", focus: "Your law learning space", next: "Choose your study level to tune your library and practice recommendations." };
  const preferenceLabel = learningPreference === "guided" ? "Step-by-step support" : learningPreference === "challenge" ? "Challenge mode" : "Balanced support";
  return <div className="home-dashboard">
    <section className="home-welcome"><div className="home-welcome-copy"><span className="home-kicker">LAW HUB / STUDY DASHBOARD</span><h1>{greet}, {name}.</h1><p>{level.next}</p><div className="home-welcome-actions"><button className="home-primary" onClick={() => setPage("library")}><Library size={16} /> Open library <ArrowRight size={15} /></button><span className="home-level-badge">Level: {level.label}</span><span className="home-level-badge">Support: {preferenceLabel}</span></div></div></section>
    {unreadMessages > 0 && <button type="button" className="home-unread-message" onClick={() => setPage("messages")} aria-label={`Open ${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}`}><span className="home-unread-icon"><MessageCircle size={18} /></span><span><strong>{unreadMessages} unread message{unreadMessages === 1 ? "" : "s"}</strong><small>Someone sent you a private message. Open Messages to read it.</small></span><ArrowRight size={18} /></button>}
    <ClubPosterCarousel />
    <section className="home-feature-index" aria-labelledby="home-feature-index-title">
      <div className="home-feature-index-head"><div><span className="home-section-eyebrow">YOUR STUDY CLASSES</span><h2 id="home-feature-index-title">Where do you want to go?</h2></div></div>
      <div className="home-feature-groups">{homeFeatureGroups.map((group) => <div className="home-feature-group" key={group.label}><span className="home-feature-group-label">{group.label}</span><div className="home-feature-buttons">{group.items.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => setPage(item.id)}><Icon size={15} /><span>{item.title}</span><ArrowRight size={13} /></button>; })}</div></div>)}</div>
    </section>
    <section className="home-daily-case" aria-labelledby="home-daily-case-title">
      <div><span className="home-groups-label"><Sparkles size={14} /> DAILY CASE · IRAC PRACTICE</span><h2 id="home-daily-case-title">Start with a case, not a blank page.</h2><p>Read the uploaded case of the day, write your own thoughts, and work through Issue, Rule, Application, and Conclusion with a plain-language AI tutor.</p></div>
      <button className="home-primary" onClick={() => setPage("daily-case")}>Open today's case <ArrowRight size={15} /></button>
    </section>
    <section className="home-groups-intro" aria-labelledby="home-groups-title">
      <div className="home-groups-copy">
        <span className="home-groups-label"><Users size={14} /> STUDY TOGETHER</span>
        <h2 id="home-groups-title">Want to form or join a study group?</h2>
        <p>Approved leaders create a group; students join with the leader’s 8-character invite code. Set study sessions, check in, and keep one another on track.</p>
        <p className="home-groups-note">Attendance is for visibility and accountability only. It does not affect marks or grades.</p>
      </div>
      <div className="home-groups-next">
        <span className="home-groups-label">GET STARTED</span>
        <ol>
          <li><strong>To lead:</strong> ask the primary admin for approval, then create a group.</li>
          <li><strong>To join:</strong> ask a group leader for the invite code.</li>
        </ol>
        <button className="home-primary" onClick={() => setPage("groups")}>Start or join a group <ArrowRight size={15} /></button>
      </div>
    </section>
    <section className="home-section-head"><div><span className="home-section-eyebrow">YOUR STUDY DESK</span><h2>{level.focus}</h2></div><button className="home-text-button" onClick={() => setPage("account")}>Update study level <ArrowRight size={14} /></button></section>
    <div className="home-grid home-grid-organized">
      <article className="home-panel"><div className="home-panel-head"><span className="home-panel-icon"><CalendarDays size={17} /></span><div><h3>Today & next</h3><small>{todayLessons.length} sessions today</small></div><button aria-label="Open timetable" onClick={() => setPage("timetable")}><ArrowRight size={16} /></button></div>{todayLessons.length ? todayLessons.map((lesson) => <div className="home-detail-row" key={lesson.id}><strong>{hm(lesson.start_time) || "Today"}</strong><div>{lesson.topic}<small>{lesson.unit}</small></div></div>) : <p className="home-empty-line">No classes today. Use the time for a short focused study block.</p>}{next.map((lesson) => <div className="home-detail-row" key={lesson.id}><strong>{new Date(lesson.lesson_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</strong><div>{lesson.topic}<small>{lesson.unit}</small></div></div>)}<button className="home-panel-link" onClick={() => setPage("timetable")}>Open timetable <ArrowRight size={14} /></button></article>
      <article className="home-panel"><div className="home-panel-head"><span className="home-panel-icon warm"><CheckSquare size={17} /></span><div><h3>My next steps</h3><small>{todos.filter((x) => !x.completed).length} to-dos open</small></div><button aria-label="Open to-do list" onClick={() => setPage("todos")}><ArrowRight size={16} /></button></div>{open.length ? open.map((item) => <div className="home-task-row" key={item.id}><span className="home-task-dot" /><div>{item.title}{item.due && <small>Due {item.due}</small>}</div></div>) : <p className="home-empty-line">You are all caught up. Pick a small goal for today.</p>}<button className="home-panel-link" onClick={() => setPage("todos")}>View all to-dos <ArrowRight size={14} /></button></article>
      <article className="home-panel"><div className="home-panel-head"><span className="home-panel-icon clay"><FileText size={17} /></span><div><h3>Assignments</h3><small>{dueSoon.length} active to review</small></div><button aria-label="Open assignments" onClick={() => setPage("assignments")}><ArrowRight size={16} /></button></div>{dueSoon.length ? dueSoon.map((item) => <div className="home-task-row" key={item.id}><span className="home-task-dot clay-dot" /><div>{item.title}<small>{item.unit} · Due {item.due}</small></div></div>) : <p className="home-empty-line">No active assignments. You have room to get ahead.</p>}<button className="home-panel-link" onClick={() => setPage("assignments")}>View assignments <ArrowRight size={14} /></button></article>
    </div>
    <section className="home-quick-links" aria-label="Quick access"><button onClick={() => setPage("library")}><Library size={17} /><span><strong>Library</strong><small>Sources for your cohort</small></span><ArrowRight size={15} /></button><button onClick={() => setPage("arena")}><Gavel size={17} /><span><strong>Debate & games</strong><small>Practise your legal arguments</small></span><ArrowRight size={15} /></button><button onClick={() => setPage("assistant")}><Sparkles size={17} /><span><strong>Study assistant</strong><small>Get help with your next question</small></span><ArrowRight size={15} /></button></section>
    <LearningLoop assignments={assignments} lessons={lessons} userId={userId} onOpenArena={() => setPage("arena")} />
  </div>;
}
