import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, RefreshCw, Target, Users } from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { AdminAccount } from "./data/types";

type EventRow = { id: number; user_id: string; event_type: string; page: string | null; created_at: string };
const dayMs = 24 * 60 * 60 * 1000;
const since = (days: number) => new Date(Date.now() - days * dayMs);
const uniqueUsers = (rows: EventRow[], from: Date) => new Set(rows.filter((row) => new Date(row.created_at) >= from).map((row) => row.user_id)).size;
const percent = (value: number, total: number) => total ? `${Math.round(value / total * 100)}%` : "—";
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AdminEngagement() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

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
    const activeDay = uniqueUsers(events, since(1));
    const activeWeek = uniqueUsers(events, since(7));
    const activeMonth = uniqueUsers(events, since(30));
    const meaningful = events.filter((event) => event.event_type !== "page_view");
    const now = Date.now();
    const eligible7 = accounts.filter((account) => now - new Date(account.created_at).getTime() >= 7 * dayMs);
    const eligible30 = accounts.filter((account) => now - new Date(account.created_at).getTime() >= 30 * dayMs);
    const hadWindowActivity = (account: AdminAccount, days: number) => {
      const start = new Date(new Date(account.created_at).getTime() + days * dayMs);
      const end = new Date(start.getTime() + 7 * dayMs);
      return events.some((event) => event.user_id === account.id && new Date(event.created_at) >= start && new Date(event.created_at) < end);
    };
    const activated = accounts.filter((account) => events.some((event) => event.user_id === account.id && new Date(event.created_at) >= new Date(account.created_at) && new Date(event.created_at).getTime() <= new Date(account.created_at).getTime() + 7 * dayMs)).length;
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

  return <section className="card card-pad admin-engagement-card">
    <div className="card-header"><span className="section-label"><BarChart3 size={15} /> Engagement dashboard</span><button className="icon-button" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading} aria-label="Refresh engagement metrics"><RefreshCw size={14} /></button></div>
    <p className="field-hint">A privacy-safe view of registrations, active students, retention and tracked study actions. Activity is based on recorded page views and feature events; it does not expose prompts or private document content.</p>
    {loading ? <p className="quiet">Loading engagement metrics…</p> : error ? <div className="connection-error">{error}</div> : <>
      <div className="admin-metric-grid">
        <div className="admin-metric"><Users size={16} /><span>Registered users</span><strong>{accounts.length}</strong><small>All approved accounts</small></div>
        <div className="admin-metric"><Activity size={16} /><span>DAU</span><strong>{metrics.activeDay}</strong><small>Active in the last 24 hours</small></div>
        <div className="admin-metric"><Activity size={16} /><span>WAU</span><strong>{metrics.activeWeek}</strong><small>Active in the last 7 days</small></div>
        <div className="admin-metric"><Activity size={16} /><span>MAU</span><strong>{metrics.activeMonth}</strong><small>Active in the last 30 days</small></div>
        <div className="admin-metric"><Target size={16} /><span>Activation</span><strong>{metrics.activationRate}</strong><small>{metrics.activated} users completed a tracked first action</small></div>
        <div className="admin-metric"><Target size={16} /><span>Meaningful actions</span><strong>{metrics.meaningful}</strong><small>Non-page-view actions recorded</small></div>
      </div>
      <div className="admin-analytics-columns">
        <div className="admin-analytics-panel"><div className="admin-analytics-heading"><strong>Retention</strong><span>Registration cohorts</span></div><div className="admin-retention-row"><span>Day 7</span><strong>{percent(metrics.day7, metrics.day7Total)}</strong><small>{metrics.day7} of {metrics.day7Total} eligible users</small></div><div className="admin-retention-row"><span>Day 30</span><strong>{percent(metrics.day30, metrics.day30Total)}</strong><small>{metrics.day30} of {metrics.day30Total} eligible users</small></div></div>
        <div className="admin-analytics-panel"><div className="admin-analytics-heading"><strong>Usage depth</strong><span>Last 30 days</span></div><div className="admin-retention-row"><span>Page views</span><strong>{metrics.pageViews}</strong><small>{metrics.pageViewsPerUser} page views per active user</small></div><div className="admin-retention-row"><span>DAU / MAU</span><strong>{percent(metrics.activeDay, metrics.activeMonth)}</strong><small>Return frequency signal</small></div></div>
      </div>
      <div className="admin-analytics-columns"><div className="admin-analytics-panel"><div className="admin-analytics-heading"><strong>Most visited areas</strong><span>Tracked page views</span></div>{metrics.pages.length ? metrics.pages.map(([name, count]) => <div className="admin-bar-row" key={name}><span>{label(name)}</span><div><i style={{ width: `${Math.max(4, Math.round(count / metrics.pages[0][1] * 100))}%` }} /></div><strong>{count}</strong></div>) : <p className="quiet">No page views recorded yet.</p>}</div><div className="admin-analytics-panel"><div className="admin-analytics-heading"><strong>Feature actions</strong><span>Tracked events</span></div>{metrics.features.length ? metrics.features.map(([name, count]) => <div className="admin-bar-row" key={name}><span>{label(name)}</span><div><i style={{ width: `${Math.max(4, Math.round(count / metrics.features[0][1] * 100))}%` }} /></div><strong>{count}</strong></div>) : <p className="quiet">No feature actions recorded yet.</p>}</div></div>
    </>}
  </section>;
}
