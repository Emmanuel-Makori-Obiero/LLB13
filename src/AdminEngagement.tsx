import { makeId } from "./lib/uuid";
import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, LoaderCircle, MessageCircle, Plus, RefreshCw, Send, Sparkles, Target, Trash2, Users } from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { AdminAccount } from "./data/types";

type EventRow = { id: number; user_id: string; event_type: string; page: string | null; created_at: string };
type AdvisorMessage = { role: "user" | "assistant"; text: string };
type AdvisorChat = { id: string; title: string; createdAt: string; messages: AdvisorMessage[] };
const advisorStorageKey = "group13-admin-advisor-chats";
const dayMs = 24 * 60 * 60 * 1000;
const since = (days: number) => new Date(Date.now() - days * dayMs);
const isActivityEvent = (event: EventRow) => event.event_type === "page_view" || event.event_type.startsWith("podcast_");
const uniqueActiveUsers = (rows: EventRow[], from: Date) => new Set(rows.filter((row) => isActivityEvent(row) && new Date(row.created_at) >= from).map((row) => row.user_id)).size;
const percent = (value: number, total: number) => total ? `${Math.round(value / total * 100)}%` : "—";
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AdminEngagement() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [advisorMessages, setAdvisorMessages] = useState<AdvisorMessage[]>([]);
  const [advisorHistory, setAdvisorHistory] = useState<AdvisorChat[]>(() => { try { return JSON.parse(localStorage.getItem(advisorStorageKey) || "[]") as AdvisorChat[]; } catch { return []; } });
  const [activeAdvisorChatId, setActiveAdvisorChatId] = useState(() => advisorHistory[0]?.id || makeId());
  const [advisorInput, setAdvisorInput] = useState("");
  const [advisorError, setAdvisorError] = useState("");

  useEffect(() => { localStorage.setItem(advisorStorageKey, JSON.stringify(advisorHistory.slice(0, 20))); }, [advisorHistory]);
  useEffect(() => { const active = advisorHistory.find((chat) => chat.id === activeAdvisorChatId); if (active) setAdvisorMessages(active.messages); }, []);
  useEffect(() => { if (!advisorMessages.length) return; setAdvisorHistory((current) => { const active = current.find((chat) => chat.id === activeAdvisorChatId); const title = advisorMessages.find((message) => message.role === "user")?.text.slice(0, 48) || "New advisor chat"; if (!active) return [{ id: activeAdvisorChatId, title, createdAt: new Date().toISOString(), messages: advisorMessages }, ...current]; return current.map((chat) => chat.id === activeAdvisorChatId ? { ...chat, title, messages: advisorMessages } : chat); }); }, [advisorMessages, activeAdvisorChatId]);
  const newAdvisorChat = () => { const id = makeId(); setActiveAdvisorChatId(id); setAdvisorMessages([]); setAdvisorError(""); setAdvisorInput(""); };
  const deleteAdvisorChat = () => { setAdvisorHistory((current) => current.filter((chat) => chat.id !== activeAdvisorChatId)); const next = advisorHistory.find((chat) => chat.id !== activeAdvisorChatId); setActiveAdvisorChatId(next?.id || makeId()); setAdvisorMessages(next?.messages || []); setAdvisorError(""); };

  useEffect(() => {
    if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
    setLoading(true);
    void Promise.all([
      supabase.from("platform_activity_events").select("id,user_id,event_type,page,created_at").order("created_at", { ascending: false }).limit(5000),
      repository.adminListAccounts(),
    ]).then(([eventsResult, accountRows]) => {
      if (eventsResult.error) throw new Error(eventsResult.error.message);
      setEvents((eventsResult.data ?? []) as EventRow[]);
      setAccounts(accountRows);
      setError("");
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load engagement metrics.")).finally(() => setLoading(false));
  }, [refreshKey]);

  const metrics = useMemo(() => {
    // Active users are the union of people who visited any page and people
    // who completed a tracked feature action during the window. A visit is
    // activity even when the student never submits an AI prompt.
    const activeDay = uniqueActiveUsers(events, since(1));
    const activeWeek = uniqueActiveUsers(events, since(7));
    const activeMonth = uniqueActiveUsers(events, since(30));
    const meaningful = events.filter((event) => event.event_type !== "page_view");
    const now = Date.now();
    const eligible7 = accounts.filter((account) => now - new Date(account.created_at).getTime() >= 7 * dayMs);
    const eligible30 = accounts.filter((account) => now - new Date(account.created_at).getTime() >= 30 * dayMs);
    const hadWindowActivity = (account: AdminAccount, days: number) => {
      const start = new Date(new Date(account.created_at).getTime() + days * dayMs);
      const end = new Date(start.getTime() + 7 * dayMs);
      return events.some((event) => event.user_id === account.id && new Date(event.created_at) >= start && new Date(event.created_at) < end);
    };
    const activated = accounts.filter((account) => events.some((event) => isActivityEvent(event) && event.user_id === account.id && new Date(event.created_at) >= new Date(account.created_at) && new Date(event.created_at).getTime() <= new Date(account.created_at).getTime() + 7 * dayMs)).length;
    const pageViewsByPage = new Map<string, number>();
    for (const event of events.filter((item) => item.event_type === "page_view")) pageViewsByPage.set(event.page || "unknown", (pageViewsByPage.get(event.page || "unknown") ?? 0) + 1);
    const featureEvents = new Map<string, number>();
    for (const event of meaningful) featureEvents.set(event.event_type, (featureEvents.get(event.event_type) ?? 0) + 1);
    return {
      activeDay, activeWeek, activeMonth, meaningful: meaningful.length,
      activated, activationRate: percent(activated, accounts.length),
      day7: eligible7.filter((account) => hadWindowActivity(account, 7)).length,
      day7Total: eligible7.length,
      day30: eligible30.filter((account) => hadWindowActivity(account, 30)).length,
      day30Total: eligible30.length,
      pageViews: events.filter((event) => event.event_type === "page_view" && new Date(event.created_at) >= since(30)).length,
      pageViewsPerUser: activeMonth ? (events.filter((event) => event.event_type === "page_view" && new Date(event.created_at) >= since(30)).length / activeMonth).toFixed(1) : "—",
      pages: [...pageViewsByPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      features: [...featureEvents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [accounts, events]);

  const advisorMetrics = () => `
PLATFORM METRICS:
- Registered users: ${accounts.length}
- DAU: ${metrics.activeDay}; WAU: ${metrics.activeWeek}; MAU: ${metrics.activeMonth}
- Activation: ${metrics.activationRate} (${metrics.activated} users)
- Day-7 retention: ${percent(metrics.day7, metrics.day7Total)} (${metrics.day7}/${metrics.day7Total})
- Day-30 retention: ${percent(metrics.day30, metrics.day30Total)} (${metrics.day30}/${metrics.day30Total})
- Page views in 30 days: ${metrics.pageViews}; page views per active user: ${metrics.pageViewsPerUser}
- Meaningful tracked actions: ${metrics.meaningful}
- Most visited areas: ${metrics.pages.map(([name, count]) => `${name} (${count})`).join(", ") || "none recorded"}
- Feature actions: ${metrics.features.map(([name, count]) => `${name} (${count})`).join(", ") || "none recorded"}`;

  const askAdvisor = async (question = "Give me a retention diagnosis and a concrete 7-day plan.") => {
    setAdvisorBusy(true); setAdvisorError("");
    try {
      const behavioralBrief = `You are an evidence-informed retention advisor, product strategist and community-growth operator for a Kenyan law-student learning platform. Use established behavioral science carefully: habit formation and cues, implementation intentions, cognitive load and friction, retrieval practice and spaced learning, self-determination (autonomy, competence, relatedness), social belonging and norms, progress feedback, commitment devices, and ethical motivation design. Use neuroscience only cautiously and do not claim that a tactic is proven by "the brain" without evidence. Never recommend dark patterns, addiction loops, manipulative notifications, shame, fabricated social proof, or exploiting vulnerable students. Label each claim as DATA, EVIDENCE-INFORMED HYPOTHESIS, or EXPERIMENT. Be concrete: give the product change, target user moment, message or flow, measurement window, success threshold, and what result would falsify the idea. Do not invent metrics or research citations; if a literature claim needs verification, say so.\n${advisorMetrics()}\n\nCONVERSATION:\n${advisorMessages.map((message) => `${message.role.toUpperCase()}: ${message.text}`).join("\n\n")}\n\nFOUNDER QUESTION:\n${question}`;
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase.functions.invoke("admin-advisor", { body: { messages: [...advisorMessages.map((message) => ({ role: message.role, content: message.text })), { role: "user", content: behavioralBrief }] } });
      if (error) {
        let detail = error.message;
        const context = (error as { context?: Response }).context;
        try { const body = context ? await context.clone().json() : null; if (body?.error) detail = String(body.error); } catch { /* retain the SDK message */ }
        throw new Error(detail);
      }
      if (!data?.answer) throw new Error(data?.error || "The advisor did not return an answer.");
      setAdvisorMessages((current) => [...current, { role: "user", text: question }, { role: "assistant", text: data.answer }]);
      setAdvisorInput("");
    } catch (caught) { setAdvisorError(caught instanceof Error ? caught.message : "The AI advisor could not respond."); }
    finally { setAdvisorBusy(false); }
  };

  return <section className="card card-pad admin-engagement-card">
    <div className="card-header"><span className="section-label"><BarChart3 size={15} /> Engagement dashboard</span><button className="icon-button" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading} aria-label="Refresh engagement metrics"><RefreshCw size={14} /></button></div>
    <p className="field-hint">A privacy-safe view of registrations, active students, retention and tracked study actions. Active users include page visits as well as feature events; prompts and private document content are not exposed.</p>
    {loading ? <p className="quiet">Loading engagement metrics…</p> : error ? <div className="connection-error">{error}</div> : <>
      <div className="admin-metric-grid">
        <div className="admin-metric"><Users size={16} /><span>Registered users</span><strong>{accounts.length}</strong><small>All approved accounts</small></div>
        <div className="admin-metric"><Activity size={16} /><span>DAU</span><strong>{metrics.activeDay}</strong><small>Visited or used a feature in the last 24 hours</small></div>
        <div className="admin-metric"><Activity size={16} /><span>WAU</span><strong>{metrics.activeWeek}</strong><small>Visited or used a feature in the last 7 days</small></div>
        <div className="admin-metric"><Activity size={16} /><span>MAU</span><strong>{metrics.activeMonth}</strong><small>Visited or used a feature in the last 30 days</small></div>
        <div className="admin-metric"><Target size={16} /><span>Activation</span><strong>{metrics.activationRate}</strong><small>{metrics.activated} users made a first visit or tracked action</small></div>
        <div className="admin-metric"><Target size={16} /><span>Meaningful actions</span><strong>{metrics.meaningful}</strong><small>Non-page-view actions recorded</small></div>
      </div>
      <div className="admin-analytics-columns">
        <div className="admin-analytics-panel"><div className="admin-analytics-heading"><strong>Retention</strong><span>Registration cohorts</span></div><div className="admin-retention-row"><span>Day 7</span><strong>{percent(metrics.day7, metrics.day7Total)}</strong><small>{metrics.day7} of {metrics.day7Total} eligible users</small></div><div className="admin-retention-row"><span>Day 30</span><strong>{percent(metrics.day30, metrics.day30Total)}</strong><small>{metrics.day30} of {metrics.day30Total} eligible users</small></div></div>
        <div className="admin-analytics-panel"><div className="admin-analytics-heading"><strong>Usage depth</strong><span>Last 30 days</span></div><div className="admin-retention-row"><span>Page views</span><strong>{metrics.pageViews}</strong><small>{metrics.pageViewsPerUser} page views per active user</small></div><div className="admin-retention-row"><span>DAU / MAU</span><strong>{percent(metrics.activeDay, metrics.activeMonth)}</strong><small>Return frequency signal</small></div></div>
      </div>
      <div className="admin-analytics-columns"><div className="admin-analytics-panel"><div className="admin-analytics-heading"><strong>Most visited areas</strong><span>Tracked page views</span></div>{metrics.pages.length ? metrics.pages.map(([name, count]) => <div className="admin-bar-row" key={name}><span>{label(name)}</span><div><i style={{ width: `${Math.max(4, Math.round(count / metrics.pages[0][1] * 100))}%` }} /></div><strong>{count}</strong></div>) : <p className="quiet">No page views recorded yet.</p>}</div><div className="admin-analytics-panel"><div className="admin-analytics-heading"><strong>Feature actions</strong><span>Tracked events</span></div>{metrics.features.length ? metrics.features.map(([name, count]) => <div className="admin-bar-row" key={name}><span>{label(name)}</span><div><i style={{ width: `${Math.max(4, Math.round(count / metrics.features[0][1] * 100))}%` }} /></div><strong>{count}</strong></div>) : <p className="quiet">No feature actions recorded yet.</p>}</div></div>
      <div className="admin-advisor-panel"><div className="admin-analytics-heading"><strong><Sparkles size={14} /> AI retention and growth advisor</strong><span>Admin-only · aggregate metrics</span></div><p className="field-hint">Chat with an evidence-informed product, behavioral-science and community-growth advisor. It receives the metrics above—not user prompts, documents, passwords or private conversations.</p><div className="admin-advisor-toolbar"><div className="admin-advisor-history">{advisorHistory.map((chat) => <button type="button" className={chat.id === activeAdvisorChatId ? "active" : ""} key={chat.id} onClick={() => { setActiveAdvisorChatId(chat.id); setAdvisorMessages(chat.messages); }}>{chat.title}</button>)}</div><div className="admin-advisor-chat-actions"><button className="secondary-button" type="button" onClick={newAdvisorChat}><Plus size={13} /> New chat</button>{(advisorMessages.length || advisorHistory.some((chat) => chat.id === activeAdvisorChatId)) ? <button className="secondary-button" type="button" onClick={deleteAdvisorChat}><Trash2 size={13} /> Delete</button> : null}</div></div>{advisorMessages.length === 0 && <button className="primary-button" type="button" onClick={() => void askAdvisor()} disabled={advisorBusy}><Sparkles size={14} /> {advisorBusy ? "Advisor is reviewing metrics…" : "Get retention advice"}</button>}{advisorMessages.length > 0 && <div className="admin-advisor-chat" aria-live="polite">{advisorMessages.map((message, index) => <div className={`admin-advisor-message ${message.role}`} key={`${activeAdvisorChatId}-${message.role}-${index}`}><span>{message.role === "user" ? "You" : "Advisor"}</span><p>{message.text}</p></div>)}</div>}{advisorError && <div className="connection-error" role="alert">{advisorError}</div>}{advisorBusy && <p className="field-hint"><LoaderCircle size={13} className="spin" /> Comparing activation, retention, cognitive load and community signals…</p>}<form className="admin-advisor-form" onSubmit={(event) => { event.preventDefault(); if (advisorInput.trim() && !advisorBusy) void askAdvisor(advisorInput.trim()); }}><input value={advisorInput} onChange={(event) => setAdvisorInput(event.target.value)} placeholder="Ask: how do I improve Day-7 retention?" aria-label="Ask the AI retention advisor" disabled={advisorBusy} /><button className="primary-button" type="submit" disabled={advisorBusy || !advisorInput.trim()}><Send size={14} /> Ask</button><button className="secondary-button" type="button" onClick={() => void askAdvisor("Give me three ethical experiments to increase weekly return visits and explain the psychology behind each.")} disabled={advisorBusy}><MessageCircle size={14} /> Retention experiments</button></form></div>
    </>}
  </section>;
}
