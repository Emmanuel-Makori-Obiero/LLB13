import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Users } from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { GroupAttendance, GroupAttendanceSummary, GroupSession, StudyGroup, StudyGroupMember } from "./data/types";
import "./groups.css";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const thirtyDaysAgo = () => {
  const value = new Date(`${today()}T12:00:00+03:00`);
  value.setDate(value.getDate() - 29);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
};
const prettyDate = (value: string | null) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00+03:00`).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" })
  : "—";
const csvCell = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function GroupAttendancePage() {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [records, setRecords] = useState<GroupAttendance[]>([]);
  const [summary, setSummary] = useState<GroupAttendanceSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<StudyGroupMember[]>([]);
  const [from, setFrom] = useState(thirtyDaysAgo());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [nextGroups, nextSessions, nextSummary] = await Promise.all([
        repository.getAllStudyGroups(), repository.getAllGroupSessions(), repository.getLecturerAttendanceSummary(from, to),
      ]);
      const nextRecords = await repository.getGroupAttendanceForSessions(nextSessions.map((session) => session.id));
      setGroups(nextGroups); setSessions(nextSessions); setSummary(nextSummary); setRecords(nextRecords);
      if (selectedGroupId && !nextGroups.some((item) => item.id === selectedGroupId)) setSelectedGroupId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load group attendance.");
    } finally { if (showLoading) setLoading(false); }
  }, [from, to, selectedGroupId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onlineChange = () => setOnline(navigator.onLine);
    window.addEventListener("online", onlineChange); window.addEventListener("offline", onlineChange);
    return () => { window.removeEventListener("online", onlineChange); window.removeEventListener("offline", onlineChange); };
  }, []);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client.channel("all-group-attendance-readonly")
      .on("postgres_changes", { event: "*", schema: "public", table: "study_groups" }, () => { void load(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "study_group_members" }, () => { void load(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_sessions" }, () => { void load(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_attendance" }, () => { void load(false); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [load]);
  useEffect(() => {
    let active = true;
    if (!selectedGroupId) { setSelectedMembers([]); return; }
    void repository.getStudyGroupMembers(selectedGroupId).then((next) => { if (active) setSelectedMembers(next); }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "Could not load this roster.");
    });
    return () => { active = false; };
  }, [selectedGroupId]);

  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const selectedGroup = groupById.get(selectedGroupId) ?? null;
  const visibleSummary = selectedGroupId ? summary.filter((item) => item.group_id === selectedGroupId) : summary;
  const visibleSessions = sessions.filter((session) => !selectedGroupId || session.group_id === selectedGroupId);
  const recordsForSession = (sessionId: string) => records.filter((entry) => entry.session_id === sessionId);
  const rosterById = useMemo(() => new Map(selectedMembers.map((member) => [member.user_id, member.display_name])), [selectedMembers]);
  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of summary) counts.set(item.group_id, (counts.get(item.group_id) ?? 0) + 1);
    return counts;
  }, [summary]);

  const exportCsv = () => {
    const rows = [
      ["Group", "Member", "Sessions held", "Present", "Late", "Excused", "Absent", "Attendance %", "Last active"],
      ...visibleSummary.map((item) => [item.group_name ?? groupById.get(item.group_id)?.name ?? "", item.display_name, item.sessions_held, item.present, item.late, item.excused, item.absent, item.attendance_percentage, item.last_active_date ?? ""]),
    ];
    const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `group-attendance-${from}-to-${to}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="groups-page">
      <div className="page-heading">
        <div><div className="eyebrow">Read-only · group activity</div><h1>Group attendance.</h1><p className="subheading">A factual view of group sessions for visibility and accountability. Records never affect marks or grading.</p></div>
        <button className="secondary-button" type="button" onClick={exportCsv} disabled={loading || !summary.length}><Download size={14} /> Export CSV</button>
      </div>
      {!online && <div className="groups-offline" role="status">You are offline. Attendance data cannot be refreshed.</div>}
      {error && <div className="connection-error" role="alert">{error}</div>}
      <section className="card card-pad groups-summary-section">
        <div className="card-header"><span className="section-label">Date range</span><span className="quiet">Times shown in East Africa Time</span></div>
        <div className="groups-date-range"><label className="groups-field">From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label className="groups-field">To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label></div>
      </section>
      {loading ? <div className="card card-pad"><p className="field-hint">Loading group attendance…</p></div> : !groups.length ? <div className="card card-pad empty">No study groups have been created yet.</div> : selectedGroup ? (
        <>
          <div className="groups-detail-heading"><button className="secondary-button" onClick={() => setSelectedGroupId("")}><ArrowLeft size={14} /> All groups</button><div><span className="section-label">Group detail</span><h2>{selectedGroup.name}</h2><p className="quiet">{memberCounts.get(selectedGroup.id) ?? 0} members · {visibleSessions.length} sessions</p></div></div>
          <section className="card card-pad groups-summary-section">
            <div className="card-header"><span className="section-label">Member summary</span><span className="quiet">Sessions attended out of sessions held</span></div>
            <div className="table-wrap"><table className="table groups-summary-table"><thead><tr><th>Member</th><th>Sessions held</th><th>Present</th><th>Late</th><th>Excused</th><th>Absent</th><th>Attendance</th><th>Last active</th></tr></thead><tbody>{visibleSummary.map((item) => <tr key={item.user_id}><td>{item.display_name}</td><td>{item.sessions_held}</td><td>{item.present}</td><td>{item.late}</td><td>{item.excused}</td><td>{item.absent}</td><td>{item.attendance_percentage}%</td><td>{prettyDate(item.last_active_date)}</td></tr>)}</tbody></table></div>
            {!visibleSummary.length && <p className="empty">No members or sessions are recorded for this date range.</p>}
          </section>
          <section className="card card-pad groups-summary-section">
            <div className="card-header"><span className="section-label">Sessions and records</span><span className="quiet">Read-only</span></div>
            {!visibleSessions.length ? <p className="empty">No group sessions are recorded.</p> : <div className="groups-session-list">{visibleSessions.map((session) => <article className="groups-session" key={session.id}>
              <div className="groups-session-head"><div><div className="groups-session-meta"><span>{session.kind === "daily" ? "Daily session" : "Project session"}</span><span>{prettyDate(session.session_date)}</span><span className={`groups-status ${session.status}`}>{session.status}</span></div><h3>{session.title}</h3>{session.project_label && <p className="row-meta">{session.project_label}</p>}</div></div>
              <div className="table-wrap"><table className="table groups-summary-table"><thead><tr><th>Member</th><th>Status</th><th>Note</th><th>Recorded</th></tr></thead><tbody>{recordsForSession(session.id).map((record) => <tr key={record.user_id}><td>{rosterById.get(record.user_id) ?? summary.find((item) => item.user_id === record.user_id && item.group_id === session.group_id)?.display_name ?? "Former member"}</td><td>{record.status}</td><td>{record.note ?? "—"}</td><td>{new Date(record.marked_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></table></div>
              {!recordsForSession(session.id).length && <p className="field-hint">No attendance records were entered for this session.</p>}
            </article>)}</div>}
          </section>
        </>
      ) : (
        <section className="card card-pad groups-summary-section">
          <div className="card-header"><span className="section-label">Study groups</span><span className="quiet">{groups.length} groups</span></div>
          <div className="groups-directory">{groups.map((group) => {
            const memberSummary = summary.filter((item) => item.group_id === group.id);
            const totalHeld = memberSummary[0]?.sessions_held ?? 0;
            const sessionCount = sessions.filter((session) => session.group_id === group.id).length;
            return <button className="groups-directory-row" type="button" key={group.id} onClick={() => setSelectedGroupId(group.id)}>
              <span className="groups-directory-icon"><Users size={17} /></span>
              <span className="groups-directory-main"><strong>{group.name}</strong><small>{memberCounts.get(group.id) ?? 0} members · {sessionCount} sessions · {totalHeld} sessions held in range</small></span>
              <span className="groups-directory-arrow">View</span>
            </button>;
          })}</div>
          {!summary.length && <p className="field-hint">No attendance summaries are available for this date range.</p>}
        </section>
      )}
    </div>
  );
}
