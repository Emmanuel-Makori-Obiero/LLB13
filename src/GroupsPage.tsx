import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Copy, DoorOpen, KeyRound, Plus, RotateCw, Trash2, UserRoundX } from "lucide-react";
import { repository, supabase } from "./data/repository";
import type { GroupAttendance, GroupAttendanceStatus, GroupAttendanceSummary, GroupSession, StudyGroup, StudyGroupMember } from "./data/types";
import "./groups.css";

const STATUS_OPTIONS: GroupAttendanceStatus[] = ["present", "late", "excused", "absent"];
const dateInNairobi = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const dateDaysAgo = (days: number) => {
  const date = new Date(`${dateInNairobi()}T12:00:00+03:00`);
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
};
const showDate = (value: string | null) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00+03:00`).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" })
  : "—";
const attendanceLabel = (status: GroupAttendanceStatus) => status[0].toUpperCase() + status.slice(1);

export default function GroupsPage() {
  const [group, setGroup] = useState<StudyGroup | null>(null);
  const [adminGroups, setAdminGroups] = useState<StudyGroup[]>([]);
  const [members, setMembers] = useState<StudyGroupMember[]>([]);
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [attendance, setAttendance] = useState<GroupAttendance[]>([]);
  const [summary, setSummary] = useState<GroupAttendanceSummary[]>([]);
  const [userId, setUserId] = useState("");
  const [isLeader, setIsLeader] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberLimit, setMemberLimit] = useState(0);
  const [adminSelectedGroupId, setAdminSelectedGroupId] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [sessionKind, setSessionKind] = useState<"daily" | "project">("daily");
  const [sessionTitle, setSessionTitle] = useState("");
  const [projectLabel, setProjectLabel] = useState("");
  const [sessionDate, setSessionDate] = useState(dateInNairobi());
  const [cutoff, setCutoff] = useState("");
  const [fromDate, setFromDate] = useState(dateDaysAgo(29));
  const [toDate, setToDate] = useState(dateInNairobi());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      if (!supabase) throw new Error("Supabase is not configured. Connect to the workspace before using study groups.");
      const [{ data: { user }, error: authError }, nextGroup, allowedToCreate, admin, configuredMemberLimit] = await Promise.all([
        supabase.auth.getUser(),
        repository.getMyStudyGroup(),
        repository.canCreateStudyGroup(),
        repository.isSuperAdmin(),
        repository.getGroupMemberLimit(),
      ]);
      if (authError || !user) throw new Error("Sign in again to load your study group.");
      setUserId(user.id);
      setCanCreate(allowedToCreate);
      setIsAdmin(admin);
      setMemberLimit(configuredMemberLimit);
      const nextAdminGroups = admin ? await repository.getAllStudyGroups() : [];
      setAdminGroups(nextAdminGroups);
      const selectedGroup = adminSelectedGroupId
        ? nextAdminGroups.find((item) => item.id === adminSelectedGroupId) ?? nextGroup?.group ?? null
        : nextGroup?.group ?? null;
      if (!selectedGroup) {
        setGroup(null); setMembers([]); setSessions([]); setAttendance([]); setSummary([]); setInviteCode("");
        return;
      }
      const selectedMembers = nextGroup?.group.id === selectedGroup.id
        ? nextGroup.members
        : await repository.getStudyGroupMembers(selectedGroup.id);
      setGroup(selectedGroup);
      setMembers(selectedMembers);
      const leader = selectedGroup.leader_id === user.id || admin;
      setIsLeader(leader);
      const [nextSessions, nextSummary, code] = await Promise.all([
        repository.getGroupSessions(selectedGroup.id),
        repository.getGroupAttendanceSummary(selectedGroup.id, fromDate, toDate),
        leader ? repository.getGroupInviteCode(selectedGroup.id) : Promise.resolve(""),
      ]);
      const records = await repository.getGroupAttendanceForSessions(nextSessions.map((session) => session.id));
      setSessions(nextSessions);
      setSummary(nextSummary);
      setInviteCode(code);
      setAttendance(records);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load study groups.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [adminSelectedGroupId, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onlineChange = () => setOnline(navigator.onLine);
    window.addEventListener("online", onlineChange);
    window.addEventListener("offline", onlineChange);
    return () => {
      window.removeEventListener("online", onlineChange);
      window.removeEventListener("offline", onlineChange);
    };
  }, []);
  useEffect(() => {
    const client = supabase;
    if (!client || !group) return;
    const channel = client.channel(`group-workspace-${group.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "study_groups", filter: `id=eq.${group.id}` }, () => { void load(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "study_group_members", filter: `group_id=eq.${group.id}` }, () => { void load(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_sessions", filter: `group_id=eq.${group.id}` }, () => { void load(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_attendance" }, () => { void load(false); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [group?.id, load]);

  const attendanceByKey = useMemo(() => new Map(attendance.map((entry) => [`${entry.session_id}:${entry.user_id}`, entry])), [attendance]);
  const act = async (key: string, action: () => Promise<void>, success?: string) => {
    setBusy(key); setError(""); setNotice("");
    try {
      await action();
      if (success) setNotice(success);
      await load(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The request could not be completed.";
      setError(/^GROUP_FULL:/i.test(message) ? message.replace(/^GROUP_FULL:\s*/i, "") : message);
    } finally { setBusy(""); }
  };

  const createGroup = (event: FormEvent) => {
    event.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    void act("create", async () => {
      await repository.createStudyGroup(name);
      setNewGroupName("");
    }, "Group created.");
  };
  const joinGroup = (event: FormEvent) => {
    event.preventDefault();
    void act("join", async () => {
      await repository.joinStudyGroup(joinCode.trim().toUpperCase());
      setJoinCode("");
    }, "You joined the group.");
  };
  const resetInviteCode = () => {
    if (!group || !window.confirm("Reset the invite code? The current code will stop working.")) return;
    void act("invite", async () => setInviteCode(await repository.resetGroupInviteCode(group.id)), "Invite code reset.");
  };
  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setNotice("Invite code copied."); setError("");
    } catch { setError("Could not copy the invite code. Select and copy it instead."); }
  };
  const renameGroup = (event: FormEvent) => {
    event.preventDefault();
    if (!group || !renameValue.trim()) return;
    void act("rename", async () => {
      await repository.renameStudyGroup(group.id, renameValue.trim());
      setRenameOpen(false);
    }, "Group name updated.");
  };
  const deleteGroup = () => {
    if (!group || !window.confirm(`Delete “${group.name}”, its roster, sessions, and attendance records? This cannot be undone.`)) return;
    void act("delete", async () => repository.deleteStudyGroup(group.id), "Group deleted.");
  };
  const leaveGroup = () => {
    if (!window.confirm("Leave this group? You can join another group later with an invite code.")) return;
    void act("leave", () => repository.leaveStudyGroup(), "You left the group.");
  };
  const removeMember = (member: StudyGroupMember) => {
    if (!group || !window.confirm(`Remove ${member.display_name} from this group?`)) return;
    void act(`remove-${member.user_id}`, () => repository.removeStudyGroupMember(group.id, member.user_id), `${member.display_name} removed from the group.`);
  };
  const createSession = (event: FormEvent) => {
    event.preventDefault();
    if (!group || !sessionTitle.trim()) return;
    void act("session-create", async () => {
      await repository.createGroupSession({
        group_id: group.id,
        kind: sessionKind,
        title: sessionTitle.trim(),
        session_date: sessionDate,
        project_label: sessionKind === "project" ? projectLabel.trim() || null : null,
        check_in_cutoff: cutoff || null,
      });
      setSessionTitle(""); setProjectLabel(""); setCutoff("");
    }, "Session created.");
  };
  const markStatus = (session: GroupSession, member: StudyGroupMember, status: GroupAttendanceStatus) => {
    const key = `${session.id}:${member.user_id}`;
    const note = noteDrafts[key] ?? attendanceByKey.get(key)?.note ?? "";
    void act(`mark-${key}`, () => repository.markGroupAttendance(session.id, member.user_id, status, note), `${member.display_name}: ${attendanceLabel(status).toLowerCase()} record saved.`);
  };
  const checkIn = (sessionId: string) => void act(`checkin-${sessionId}`, async () => {
    const status = await repository.checkInGroupSession(sessionId);
    setNotice(`Your record is ${status}.`);
  });

  return (
    <div className="groups-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Shared study · private group roster</div>
          <h1>Groups.</h1>
          <p className="subheading">Study together and keep a clear record of group sessions. Attendance is for visibility and accountability only; it does not affect marks.</p>
        </div>
      </div>
      {!online && <div className="groups-offline" role="status">You are offline. Group changes need a connection and have not been saved.</div>}
      {error && <div className="connection-error" role="alert">{error}</div>}
      {notice && <p className="groups-notice" role="status">{notice}</p>}
      {isAdmin && adminGroups.length > 0 && <label className="groups-field groups-admin-group-select">Manage any group
        <select value={adminSelectedGroupId} onChange={(event) => setAdminSelectedGroupId(event.target.value)}>
          <option value="">My group</option>
          {adminGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      {loading ? <div className="card card-pad"><p className="field-hint">Loading your group…</p></div> : !group ? (
        <div className="groups-entry-grid">
          <section className="card card-pad">
            <div className="card-header"><span className="section-label">Join a group</span><span className="quiet">8-character invite code</span></div>
            <p className="field-hint">Each student can belong to one study group at a time.</p>
            <form className="groups-form" onSubmit={joinGroup}>
              <label className="groups-field">Invite code
                <input required minLength={8} maxLength={8} autoCapitalize="characters" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="AB12CD34" />
              </label>
              <button className="primary-button" type="submit" disabled={busy === "join" || !online}><KeyRound size={14} /> {busy === "join" ? "Joining…" : "Join group"}</button>
            </form>
          </section>
          {canCreate && <section className="card card-pad">
            <div className="card-header"><span className="section-label">Create a group</span><span className="quiet">Maximum {memberLimit} members</span></div>
            <p className="field-hint">Approved leaders and admins can create one group. You will appear on its roster as leader.</p>
            <form className="groups-form" onSubmit={createGroup}>
              <label className="groups-field">Group name
                <input required maxLength={80} value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="e.g. Evidence study group" />
              </label>
              <button className="primary-button" type="submit" disabled={busy === "create" || !online}><Plus size={14} /> {busy === "create" ? "Creating…" : "Create a group"}</button>
            </form>
          </section>}
          {!canCreate && <p className="field-hint groups-leader-note">Group creation is available to approved group leaders.</p>}
        </div>
      ) : (
        <>
          <section className="card card-pad groups-overview">
            <div className="groups-overview-head">
              <div>
                <div className="section-label">Study group</div>
                {renameOpen ? <form className="groups-rename-form" onSubmit={renameGroup}>
                  <label className="groups-field">Group name<input required maxLength={80} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label>
                  <button className="primary-button" disabled={busy === "rename" || !online}>{busy === "rename" ? "Saving…" : "Save name"}</button>
                  <button className="secondary-button" type="button" onClick={() => setRenameOpen(false)}>Cancel</button>
                </form> : <h2>{group.name}</h2>}
                <p className="groups-count">{members.length} / {memberLimit} members <span>·</span> Leader: {members.find((member) => member.user_id === group.leader_id)?.display_name ?? "Group leader"}</p>
              </div>
              <div className="groups-actions">
                {isLeader && !renameOpen && <button className="secondary-button" onClick={() => { setRenameValue(group.name); setRenameOpen(true); }}>Rename</button>}
                {members.some((member) => member.user_id === userId) && group.leader_id !== userId && <button className="secondary-button" disabled={busy === "leave" || !online} onClick={leaveGroup}><DoorOpen size={14} /> Leave group</button>}
                {isLeader && <button className="small-danger" disabled={busy === "delete" || !online} onClick={deleteGroup}><Trash2 size={13} /> Delete group</button>}
              </div>
            </div>
            {isLeader && <div className="groups-invite">
              <div><div className="section-label">Invite code · leader/admin only</div><code>{inviteCode || "Loading…"}</code></div>
              <div className="groups-actions">
                <button className="secondary-button" disabled={!inviteCode} onClick={() => void copyInviteCode()}><Copy size={13} /> Copy</button>
                <button className="secondary-button" disabled={busy === "invite" || !online} onClick={resetInviteCode}><RotateCw size={13} /> Reset code</button>
              </div>
            </div>}
            <div className="groups-roster">
              <div className="card-header"><span className="section-label">Roster</span><span className="quiet">{members.length} members</span></div>
              <div className="row-list">
                {members.map((member) => <div className="row" key={member.user_id}>
                  <div className="groups-initials" aria-hidden="true">{member.display_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
                  <div className="row-main"><div className="row-title">{member.display_name}{member.user_id === userId ? " · You" : ""}</div><div className="row-meta">{member.user_id === group.leader_id ? "Group leader" : `Joined ${showDate(member.joined_at)}`}</div></div>
                  {member.user_id === group.leader_id && <span className="chip green">Leader</span>}
                  {isLeader && member.user_id !== group.leader_id && <button className="small-danger" disabled={busy === `remove-${member.user_id}` || !online} aria-label={`Remove ${member.display_name}`} onClick={() => removeMember(member)}><UserRoundX size={13} /> Remove</button>}
                </div>)}
              </div>
            </div>
          </section>

          <section className="card card-pad groups-attendance-section">
            <div className="card-header"><span className="section-label">Group sessions</span><span className="quiet">Accountability record · not marks</span></div>
            {isLeader && <form className="groups-session-form" onSubmit={createSession}>
              <div className="groups-session-form-head"><strong>New session</strong><span className="field-hint">An optional cutoff sets check-ins to late after that time in Nairobi.</span></div>
              <label className="groups-field">Session type<select value={sessionKind} onChange={(event) => setSessionKind(event.target.value as "daily" | "project")}><option value="daily">Daily</option><option value="project">Project</option></select></label>
              <label className="groups-field">Title<input required maxLength={120} value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} placeholder="e.g. Read cases on consideration" /></label>
              {sessionKind === "project" && <label className="groups-field">Project label<input maxLength={120} value={projectLabel} onChange={(event) => setProjectLabel(event.target.value)} placeholder="e.g. Presentation rehearsal" /></label>}
              <label className="groups-field">Date<input type="date" required value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} /></label>
              <label className="groups-field">Check-in cutoff <span className="field-hint">Optional</span><input type="time" value={cutoff} onChange={(event) => setCutoff(event.target.value)} /></label>
              <button className="primary-button" type="submit" disabled={busy === "session-create" || !online}><Plus size={14} /> {busy === "session-create" ? "Creating…" : "Create session"}</button>
            </form>}
            {!sessions.length ? <p className="empty">No group sessions have been created yet.</p> : <div className="groups-session-list">
              {sessions.map((session) => {
                const ownRecord = attendanceByKey.get(`${session.id}:${userId}`);
                return <article className="groups-session" key={session.id}>
                  <div className="groups-session-head">
                    <div><div className="groups-session-meta"><span>{session.kind === "daily" ? "Daily session" : "Project session"}</span><span>{showDate(session.session_date)}</span><span className={`groups-status ${session.status}`}>{session.status}</span></div><h3>{session.title}</h3>{session.project_label && <p className="row-meta">{session.project_label}</p>}{session.check_in_cutoff && <p className="row-meta">Check-in cutoff · {session.check_in_cutoff.slice(0, 5)} Nairobi time</p>}</div>
                    <div className="groups-actions">
                      {!isLeader && session.status === "open" && !ownRecord && <button className="primary-button" disabled={busy === `checkin-${session.id}` || !online} onClick={() => checkIn(session.id)}><Check size={14} /> {busy === `checkin-${session.id}` ? "Checking in…" : "Check in"}</button>}
                      {!isLeader && ownRecord && <span className="chip">Your record: {attendanceLabel(ownRecord.status)}</span>}
                      {isLeader && session.status === "open" && <button className="secondary-button" disabled={busy === `close-${session.id}` || !online} onClick={() => void act(`close-${session.id}`, () => repository.closeGroupSession(session.id), "Session closed.")}><Check size={14} /> Close session</button>}
                      {isLeader && <button className="small-danger" disabled={busy === `delete-session-${session.id}` || !online} onClick={() => { if (window.confirm("Delete this session and its attendance records?")) void act(`delete-session-${session.id}`, () => repository.deleteGroupSession(session.id), "Session deleted."); }}><Trash2 size={13} /> Delete</button>}
                    </div>
                  </div>
                  {isLeader && session.status === "open" && <div className="groups-mark-grid">
                    {members.map((member) => {
                      const key = `${session.id}:${member.user_id}`;
                      const record = attendanceByKey.get(key);
                      return <div className="groups-mark-row" key={member.user_id}>
                        <div className="groups-mark-person"><strong>{member.display_name}</strong>{record && <span className={`groups-mark-current ${record.status}`}>{attendanceLabel(record.status)}</span>}</div>
                        <div className="groups-mark-controls">
                          <label className="groups-note-field"><span className="sr-only">Optional attendance note for {member.display_name}</span><input maxLength={200} value={noteDrafts[key] ?? record?.note ?? ""} onChange={(event) => setNoteDrafts((current) => ({ ...current, [key]: event.target.value }))} placeholder="Optional note" /></label>
                          <div className="groups-status-buttons">{STATUS_OPTIONS.map((status) => <button type="button" key={status} className={`groups-status-button ${record?.status === status ? "selected" : ""}`} disabled={busy === `mark-${key}` || !online} onClick={() => markStatus(session, member, status)}>{attendanceLabel(status)}</button>)}</div>
                        </div>
                      </div>;
                    })}
                  </div>}
                  {!isLeader && <div className="groups-history-row"><span className="section-label">Your group record</span><span className="field-hint">{ownRecord ? `${attendanceLabel(ownRecord.status)} · recorded ${new Date(ownRecord.marked_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" })}` : session.status === "open" ? "Check in while the session is open." : "No record was entered for this session."}</span></div>}
                </article>;
              })}
            </div>}
          </section>

          <section className="card card-pad groups-summary-section">
            <div className="card-header"><span className="section-label">Attendance summary</span><span className="quiet">Visibility only · no effect on marks</span></div>
            <div className="groups-date-range"><label className="groups-field">From<input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="groups-field">To<input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} /></label></div>
            <div className="table-wrap"><table className="table groups-summary-table"><thead><tr><th>Member</th><th>Sessions held</th><th>Present</th><th>Late</th><th>Excused</th><th>Absent</th><th>Attendance</th><th>Last active</th></tr></thead><tbody>{summary.map((item) => <tr key={item.user_id}><td>{item.display_name}</td><td>{item.sessions_held}</td><td>{item.present}</td><td>{item.late}</td><td>{item.excused}</td><td>{item.absent}</td><td>{item.attendance_percentage}%</td><td>{showDate(item.last_active_date)}</td></tr>)}</tbody></table></div>
            {!summary.length && <p className="empty">No attendance summary is available for this date range yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
