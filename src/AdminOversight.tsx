import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CalendarCheck, LockKeyhole, RefreshCw } from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { AdminAccount } from "./data/types";

type EventRow = { id: number; user_id: string; event_type: string; page: string | null; created_at: string };
type ProviderUsageRow = { user_id: string; category: string; provider: string; model: string | null; status: string; request_units: number; input_units: number; output_units: number; unit_label: string; created_at: string };
type QuotaRow = { user_id: string; kind: string; created_at: string };
type AttendanceRow = { user_id: string; lesson_id: string; checked_in_at: string; timetable: { unit: string; topic: string; lesson_date: string } | null };
const QUOTAS: Record<string, number> = { text: 60, book_metadata: 1000, podcast: 5, image: 10, video: 1 };
const when = (value: string) => new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });
const eventLabel: Record<string, string> = { page_view: "Viewed a page", podcast_script_generated: "Generated a podcast script", podcast_audio_generated: "Generated podcast audio", podcast_audio_failed: "Podcast audio generation failed" };
const title = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AdminOversight() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [usage, setUsage] = useState<ProviderUsageRow[]>([]);
  const [quota, setQuota] = useState<QuotaRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
    setLoading(true);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    void Promise.all([
      supabase.from("platform_activity_events").select("id,user_id,event_type,page,created_at").order("created_at", { ascending: false }).limit(300),
      supabase.from("ai_provider_usage").select("user_id,category,provider,model,status,request_units,input_units,output_units,unit_label,created_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("ai_quota_usage").select("user_id,kind,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      supabase.from("class_attendance").select("user_id,lesson_id,checked_in_at,timetable(unit,topic,lesson_date)").order("checked_in_at", { ascending: false }).limit(300),
      repository.adminListAccounts(),
    ]).then(([eventsResult, usageResult, quotaResult, attendanceResult, accountRows]) => {
      const firstError = eventsResult.error || usageResult.error || quotaResult.error || attendanceResult.error;
      if (firstError) setError(firstError.message);
      else {
        setError("");
        setEvents((eventsResult.data ?? []) as EventRow[]);
        setUsage((usageResult.data ?? []) as ProviderUsageRow[]);
        setQuota((quotaResult.data ?? []) as QuotaRow[]);
        setAttendance((attendanceResult.data ?? []) as unknown as AttendanceRow[]);
      }
      setAccounts(accountRows);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load admin reports.")).finally(() => setLoading(false));
  }, [refreshKey]);
  const nameFor = (id: string) => { const account = accounts.find((item) => item.id === id); return account?.display_name || account?.email || id.slice(0, 8); };
  const summaries = useMemo(() => {
    const map = new Map<string, { requests: number; input: number; output: number; labels: Set<string>; providers: Set<string> }>();
    for (const row of usage) {
      const current = map.get(row.category) ?? { requests: 0, input: 0, output: 0, labels: new Set<string>(), providers: new Set<string>() };
      current.requests += Number(row.request_units || 0); current.input += Number(row.input_units || 0); current.output += Number(row.output_units || 0);
      current.labels.add(row.unit_label); current.providers.add(row.provider); map.set(row.category, current);
    }
    return [...map.entries()].sort((a, b) => b[1].requests - a[1].requests);
  }, [usage]);
  const quotaSummary = Object.entries(QUOTAS).map(([kind, limit]) => {
    const used = quota.filter((row) => row.kind === kind).length;
    return { kind, limit, used, remaining: Math.max(0, limit - used) };
  });
  return <section className="admin-stack" aria-label="Admin activity and attendance">
    <div className="card card-pad">
      <div className="card-header"><span className="section-label"><LockKeyhole size={15}/> Private API credit usage</span><button className="icon-button" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading} aria-label="Refresh API usage"><RefreshCw size={14}/></button></div>
      <p className="field-hint">Admin only. Provider credits are not one universal currency, so this ledger reports actual provider requests plus measurable units. Voice usage is shown as characters or request chunks; transcription is shown as audio seconds. It does not expose prompts, document text, or API keys.</p>
      {loading ? <p className="quiet">Loading usage…</p> : error ? <div className="connection-error">{error} Apply <code>supabase/migrations/021_admin_provider_usage_ledger.sql</code> if this feature is new.</div> : <>
        <div className="usage-quota-grid">{quotaSummary.map((item) => <div className="usage-quota" key={item.kind}><span>{title(item.kind)} hourly quota</span><strong>{item.remaining} remaining</strong><small>{item.used} used of {item.limit} · rolling 60 minutes</small></div>)}</div>
        {summaries.length ? <div className="row-list">{summaries.map(([category, item]) => <div className="row" key={category}><div className="row-main"><div className="row-title">{title(category)}</div><div className="row-meta">{item.requests} request units · {item.input + item.output > 0 ? `${(item.input + item.output).toLocaleString()} measured ${[...item.labels].join(" / ")}` : "provider request count only"} · {[...item.providers].join(", ")}</div></div></div>)}</div> : <p className="quiet">No provider usage has been recorded yet.</p>}
        <p className="field-hint">The ledger shows the latest 2,000 provider events. Exact money/credit balances remain provider-specific and can only be read from each provider's billing or quota console.</p>
      </>}
    </div>
    <div className="card card-pad">
      <div className="card-header"><span className="section-label"><Activity size={15}/> Platform activity</span><span className="quiet">Latest 300 events</span></div>
      <p className="field-hint">Records page visits and podcast-generation outcomes only; it does not capture prompts, document text, or private content.</p>
      {loading ? <p className="quiet">Loading reports…</p> : error ? <div className="connection-error">{error}</div> : events.length ? <div className="row-list">{events.map((event) => <div className="row" key={event.id}><div className="row-main"><div className="row-title">{nameFor(event.user_id)} · {eventLabel[event.event_type] ?? event.event_type}</div><div className="row-meta">{event.page ? `${event.page} · ` : ""}{when(event.created_at)}</div></div></div>)}</div> : <p className="quiet">No activity events recorded yet.</p>}
    </div>
    <div className="card card-pad">
      <div className="card-header"><span className="section-label"><BarChart3 size={15}/> Provider event detail</span><span className="quiet">Latest 2,000</span></div>
      {!loading && usage.length ? <div className="row-list">{usage.slice(0, 80).map((item, index) => <div className="row" key={`${item.created_at}:${item.user_id}:${index}`}><div className="row-main"><div className="row-title">{nameFor(item.user_id)} · {title(item.category)} · {item.provider}</div><div className="row-meta">{item.model ?? "model not reported"} · {item.status} · {item.request_units} request unit{item.request_units === 1 ? "" : "s"} · {when(item.created_at)}</div></div></div>)}</div> : <p className="quiet">No provider events yet.</p>}
    </div>
    <div className="card card-pad">
      <div className="card-header"><span className="section-label"><CalendarCheck size={15}/> Student class check-ins</span><span className="quiet">Latest 300</span></div>
      {attendance.length ? <div className="row-list">{attendance.map((item) => <div className="row" key={`${item.lesson_id}:${item.user_id}`}><div className="row-main"><div className="row-title">{nameFor(item.user_id)} · {item.timetable?.unit ?? "Class"}</div><div className="row-meta">{item.timetable?.topic ?? ""} · {item.timetable?.lesson_date ?? ""} · checked in {when(item.checked_in_at)}</div></div></div>)}</div> : <p className="quiet">{loading ? "Loading…" : "No class check-ins yet."}</p>}
    </div>
  </section>;
}
