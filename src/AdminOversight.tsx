import { useEffect, useState } from "react";
import { Activity, BarChart3, CalendarCheck } from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { AdminAccount } from "./data/types";

type EventRow = { id: number; user_id: string; event_type: string; page: string | null; created_at: string };
type UsageRow = { user_id: string; kind: string; created_at: string };
type AttendanceRow = { user_id: string; lesson_id: string; checked_in_at: string; timetable: { unit: string; topic: string; lesson_date: string } | null };
const when = (value: string) => new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });
const eventLabel: Record<string, string> = { page_view: "Viewed a page", podcast_script_generated: "Generated a podcast script", podcast_audio_generated: "Generated podcast audio", podcast_audio_failed: "Podcast audio generation failed" };

export default function AdminOversight() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
    void Promise.all([
      supabase.from("platform_activity_events").select("id,user_id,event_type,page,created_at").order("created_at", { ascending: false }).limit(300),
      supabase.from("ai_quota_usage").select("user_id,kind,created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("class_attendance").select("user_id,lesson_id,checked_in_at,timetable(unit,topic,lesson_date)").order("checked_in_at", { ascending: false }).limit(300),
      repository.adminListAccounts(),
    ]).then(([eventsResult, usageResult, attendanceResult, accountRows]) => {
      const firstError = eventsResult.error || usageResult.error || attendanceResult.error;
      if (firstError) setError(firstError.message);
      else { setEvents((eventsResult.data ?? []) as EventRow[]); setUsage((usageResult.data ?? []) as UsageRow[]); setAttendance((attendanceResult.data ?? []) as unknown as AttendanceRow[]); }
      setAccounts(accountRows);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load admin reports.")).finally(() => setLoading(false));
  }, []);
  const nameFor = (id: string) => { const account = accounts.find((item) => item.id === id); return account?.display_name || account?.email || id.slice(0, 8); };
  const podcastAttempts = usage.filter((row) => row.kind === "podcast").length;
  return <section className="admin-stack" aria-label="Admin activity and attendance">
    <div className="card card-pad">
      <div className="card-header"><span className="section-label"><Activity size={15}/> Platform activity</span><span className="quiet">Latest 300 events</span></div>
      <p className="field-hint">Records page visits and podcast-generation outcomes only; it does not capture prompts, document text, or private content.</p>
      {loading ? <p className="quiet">Loading reports…</p> : error ? <div className="connection-error">{error} Apply the admin oversight migration if this feature is new.</div> : events.length ? <div className="row-list">{events.map((event) => <div className="row" key={event.id}><div className="row-main"><div className="row-title">{nameFor(event.user_id)} · {eventLabel[event.event_type] ?? event.event_type}</div><div className="row-meta">{event.page ? `${event.page} · ` : ""}{when(event.created_at)}</div></div></div>)}</div> : <p className="quiet">No activity events recorded yet.</p>}
    </div>
    <div className="card card-pad">
      <div className="card-header"><span className="section-label"><BarChart3 size={15}/> AI usage</span><span className="quiet">{podcastAttempts} podcast quota reservations in the last 1,000 records</span></div>
      <p className="field-hint">These are request/quota counts, not provider billing credits or dollar costs. A reservation can count even if a provider request fails.</p>
      <div className="row-list">{[...new Set(usage.map((row) => row.kind))].map((kind) => <div className="row" key={kind}><div className="row-main"><div className="row-title">{kind.replace(/_/g, " ")}</div><div className="row-meta">{usage.filter((row) => row.kind === kind).length} reservations · latest {when(usage.find((row) => row.kind === kind)!.created_at)}</div></div></div>)}</div>
    </div>
    <div className="card card-pad">
      <div className="card-header"><span className="section-label"><CalendarCheck size={15}/> Student class check-ins</span><span className="quiet">Latest 300</span></div>
      {attendance.length ? <div className="row-list">{attendance.map((item) => <div className="row" key={`${item.lesson_id}:${item.user_id}`}><div className="row-main"><div className="row-title">{nameFor(item.user_id)} · {item.timetable?.unit ?? "Class"}</div><div className="row-meta">{item.timetable?.topic ?? ""} · {item.timetable?.lesson_date ?? ""} · checked in {when(item.checked_in_at)}</div></div></div>)}</div> : <p className="quiet">{loading ? "Loading…" : "No class check-ins yet."}</p>}
    </div>
  </section>;
}
