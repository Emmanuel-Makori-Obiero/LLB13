import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Copy, Download, DoorOpen, ExternalLink, FileUp, KeyRound, Library, Megaphone, Plus, RotateCw, Send, Trash2, UserRoundX, Video } from "lucide-react";
import { repository, supabase } from "./data/repository";
import { studyGroupDisplayName, type GroupAnnouncement, type GroupAttendance, type GroupAttendanceStatus, type GroupAttendanceSummary, type GroupLeaderRequest, type GroupMaterialContentKind, type GroupMaterialShare, type GroupMaterialShareScope, type GroupSession, type Material, type StudyGroup, type StudyGroupMember, type Unit } from "./data/types";
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
  const [groupMaterials, setGroupMaterials] = useState<GroupMaterialShare[]>([]);
  const [announcements, setAnnouncements] = useState<GroupAnnouncement[]>([]);
  const [libraryMaterials, setLibraryMaterials] = useState<Material[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isLeader, setIsLeader] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberLimit, setMemberLimit] = useState(0);
  const [adminSelectedGroupId, setAdminSelectedGroupId] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [leaderRequest, setLeaderRequest] = useState<GroupLeaderRequest | null>(null);
  const [leaderRequestMessage, setLeaderRequestMessage] = useState("");
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
  const [shareTitle, setShareTitle] = useState("");
  const [shareScope, setShareScope] = useState<GroupMaterialShareScope>("group");
  const [shareSessionId, setShareSessionId] = useState("");
  const [shareUnitName, setShareUnitName] = useState("");
  const [shareLibraryId, setShareLibraryId] = useState("");
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [shareSource, setShareSource] = useState<"library" | "upload">("library");
  const [shareKind, setShareKind] = useState<GroupMaterialContentKind>("resource");
  const [fromDate, setFromDate] = useState(dateDaysAgo(29));
  const [toDate, setToDate] = useState(dateInNairobi());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementPinned, setAnnouncementPinned] = useState(false);
  const [dashboardRequest, setDashboardRequest] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      if (!supabase) throw new Error("Supabase is not configured. Connect to the workspace before using study groups.");
      const [{ data: { user }, error: authError }, nextGroup, allowedToCreate, admin, configuredMemberLimit, nextLeaderRequest] = await Promise.all([
        supabase.auth.getUser(),
        repository.getMyStudyGroup(),
        repository.canCreateStudyGroup(),
        repository.isSuperAdmin(),
        repository.getGroupMemberLimit(),
        repository.getMyGroupLeaderRequest(),
      ]);
      if (authError || !user) throw new Error("Sign in again to load your study group.");
      setUserId(user.id);
      setUserEmail(user.email ?? "");
      setCanCreate(allowedToCreate);
      setLeaderRequest(nextLeaderRequest);
      setIsAdmin(admin);
      setMemberLimit(configuredMemberLimit);
      const nextAdminGroups = admin ? await repository.getAllStudyGroups() : [];
      setAdminGroups(nextAdminGroups);
      const selectedGroup = adminSelectedGroupId
        ? nextAdminGroups.find((item) => item.id === adminSelectedGroupId) ?? nextGroup?.group ?? null
        : nextGroup?.group ?? null;
      if (!selectedGroup) {
        setGroup(null); setMembers([]); setSessions([]); setAttendance([]); setSummary([]); setGroupMaterials([]); setAnnouncements([]); setLibraryMaterials([]); setUnits([]); setInviteCode("");
        return;
      }
      const selectedMembers = nextGroup?.group.id === selectedGroup.id
        ? nextGroup.members
        : await repository.getStudyGroupMembers(selectedGroup.id);
      setGroup(selectedGroup);
      setMembers(selectedMembers);
      const leader = selectedGroup.leader_id === user.id || admin;
      setIsLeader(leader);
      const [nextSessions, nextSummary, code, nextAnnouncements] = await Promise.all([
        repository.getGroupSessions(selectedGroup.id),
        repository.getGroupAttendanceSummary(selectedGroup.id, fromDate, toDate),
        leader ? repository.getGroupInviteCode(selectedGroup.id) : Promise.resolve(""),
        repository.getGroupAnnouncements(selectedGroup.id),
      ]);
      const records = await repository.getGroupAttendanceForSessions(nextSessions.map((session) => session.id));
      const nextGroupMaterials = await repository.getGroupMaterialShares(selectedGroup.id);
      setSessions(nextSessions);
      setSummary(nextSummary);
      setInviteCode(code);
      setAttendance(records);
      setGroupMaterials(nextGroupMaterials);
      setAnnouncements(nextAnnouncements);
      if (leader) {
        const [nextUnits, nextLibraryMaterials] = await Promise.all([repository.getUnits(), repository.getMaterials()]);
        setUnits(nextUnits);
        setLibraryMaterials(nextLibraryMaterials);
      } else {
        setUnits([]); setLibraryMaterials([]);
      }
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
      .on("postgres_changes", { event: "*", schema: "public", table: "group_material_shares", filter: `group_id=eq.${group.id}` }, () => { void load(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_announcements", filter: `group_id=eq.${group.id}` }, () => { void load(false); })
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
    if (!group || !window.confirm(`Delete “${studyGroupDisplayName(group.name)}”, its roster, sessions, and attendance records? This cannot be undone.`)) return;
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
  const clearAttendance = (session: GroupSession) => {
    if (!window.confirm(`Clear every attendance record for “${session.title}”? This can be used to correct a session before marking it again.`)) return;
    void act(`clear-${session.id}`, async () => {
      const removed = await repository.clearGroupSessionAttendance(session.id);
      setNotice(`${removed} attendance record${removed === 1 ? "" : "s"} cleared.`);
    });
  };
  const shareMaterial = (event: FormEvent) => {
    event.preventDefault();
    if (!group || !shareTitle.trim()) return;
    if (shareSource === "library" && !shareLibraryId) { setError("Choose a Library material to share."); return; }
    if (shareSource === "upload" && !shareFile) { setError("Choose a file to upload to the group."); return; }
    void act("share-material", async () => {
      await repository.createGroupMaterialShare({
        group_id: group.id,
        title: shareTitle.trim(),
        share_scope: shareScope,
        session_id: shareScope === "session" ? shareSessionId : null,
        unit_name: shareScope === "unit" ? shareUnitName : null,
        material_id: shareSource === "library" ? shareLibraryId : null,
        content_kind: shareKind,
      }, shareSource === "upload" ? shareFile ?? undefined : undefined);
      setShareTitle(""); setShareLibraryId(""); setShareFile(null); setShareSessionId(""); setShareUnitName(""); setShareKind("resource");
    }, "Material shared with the group.");
  };
  const postAnnouncement = (event: FormEvent) => {
    event.preventDefault();
    if (!group || !announcementTitle.trim() || !announcementBody.trim()) return;
    void act("announcement", async () => {
      await repository.createGroupAnnouncement(group.id, announcementTitle.trim(), announcementBody.trim(), announcementPinned);
      setAnnouncementTitle(""); setAnnouncementBody(""); setAnnouncementPinned(false);
    }, "Announcement posted to the group.");
  };
  const requestDashboardChange = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || dashboardRequest.trim().length < 10) return;
    setBusy("dashboard-request"); setError(""); setNotice("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      const result = await supabase.from("support_tickets").insert({ user_id: auth.user?.id, subject: `Group dashboard request — ${group?.name ?? "my group"}`, category: "suggestion", message: dashboardRequest.trim() }).select("id").single();
      if (result.error) throw new Error(result.error.message);
      setDashboardRequest(""); setNotice("Your dashboard change request was sent privately to the platform administrator.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not send the dashboard request."); }
    finally { setBusy(""); }
  };
  const publishGroupMaterial = (share: GroupMaterialShare) => {
    if (!share.url || !group) return;
    void act(`publish-${share.id}`, async () => {
      const response = await fetch(share.url!);
      if (!response.ok) throw new Error("Could not download the group file for Library publishing.");
      const blob = await response.blob();
      const filename = share.title.replace(/[^a-zA-Z0-9._-]+/g, "-") || "group-resource";
      const file = new File([blob], filename, { type: share.mime_type || blob.type || "application/octet-stream" });
      const created = await repository.createMaterial({
        title: share.title,
        author: group.name,
        type: "Group resource",
        unit: share.unit_name || "Group shared",
        topic: share.share_scope === "session" ? "Session resource" : "Group resource",
        date: new Date().toISOString().slice(0, 10),
        source: `Shared by ${group.name}`,
        url: "",
      }, file);
      await repository.markGroupMaterialPublished(share.id, created.id);
    }, "Material copied to the shared Library.");
  };
  const submitLeaderRequest = (event: FormEvent) => {
    event.preventDefault();
    void act("leader-request", async () => {
      const request = await repository.submitGroupLeaderRequest(leaderRequestMessage);
      setLeaderRequest(request);
      setLeaderRequestMessage("");
    }, "Your group-leader request was sent to the platform admin.");
  };
  const exportAttendance = () => {
    if (!group || !summary.length) return;
    const cell = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Group", "From", "To", "Member", "Sessions held", "Present", "Late", "Excused", "Absent", "Attendance %", "Last active"],
      ...summary.map((item) => [studyGroupDisplayName(group.name), fromDate, toDate, item.display_name, item.sessions_held, item.present, item.late, item.excused, item.absent, item.attendance_percentage, item.last_active_date ?? ""]),
    ];
    const csv = rows.map((row) => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${studyGroupDisplayName(group.name).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-attendance-${fromDate}-to-${toDate}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Attendance downloaded for ${fromDate} to ${toDate}.`);
  };

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
              {adminGroups.map((item) => <option key={item.id} value={item.id}>{studyGroupDisplayName(item.name)}</option>)}
        </select>
      </label>}
      {loading ? <div className="card card-pad"><p className="field-hint">Loading your group…</p></div> : !group ? (
        <div className="groups-entry-grid">
          <section className="card card-pad">
            <div className="card-header"><span className="section-label">1 · Join a group</span><span className="quiet">Use a leader’s code</span></div>
            <p className="field-hint">Have an invite code? Enter it here. Each student can belong to one study group at a time.</p>
            <form className="groups-form" onSubmit={joinGroup}>
              <label className="groups-field">Invite code
                <input required minLength={8} maxLength={8} autoCapitalize="characters" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="AB12CD34" />
              </label>
              <button className="primary-button" type="submit" disabled={busy === "join" || !online}><KeyRound size={14} /> {busy === "join" ? "Joining…" : "Join group"}</button>
            </form>
          </section>
          <section className="card card-pad groups-approval-card">
            <div className="card-header"><span className="section-label">2 · Become a group leader</span><span className="quiet">No invite code needed</span></div>
            <p className="field-hint">Ask the platform admin to approve your account. Your request and optional note will appear in the admin dashboard.</p>
            {leaderRequest?.status === "pending" ? <div className="groups-request-status pending"><strong>Request pending</strong><span>Sent {showDate(leaderRequest.created_at.slice(0, 10))}. The admin will review it.</span></div> : leaderRequest?.status === "approved" || canCreate ? <div className="groups-request-status approved"><strong>Leader access approved</strong><span>You can create a study group below.</span></div> : leaderRequest?.status === "rejected" ? <div className="groups-request-status rejected"><strong>Request was not approved</strong><span>You may send a new request with more context.</span></div> : null}
            {(!leaderRequest || leaderRequest.status === "rejected") && !canCreate && <form className="groups-request-form" onSubmit={submitLeaderRequest}>
              <label className="groups-field">Optional note<textarea rows={3} maxLength={500} value={leaderRequestMessage} onChange={(event) => setLeaderRequestMessage(event.target.value)} placeholder="Tell the admin why you would like to organize a study group…" /></label>
              <button className="primary-button" type="submit" disabled={busy === "leader-request" || !online}><Send size={14} /> {busy === "leader-request" ? "Sending…" : "Send request to admin"}</button>
            </form>}
            <p className="field-hint">After approval, the “Create a group” form will appear automatically when you refresh or revisit Groups.</p>
          </section>
          {canCreate && <section className="card card-pad">
            <div className="card-header"><span className="section-label">3 · Create a group</span><span className="quiet">Maximum {memberLimit} members</span></div>
            <p className="field-hint">You are approved. Choose a name and you will appear on its roster as leader.</p>
            <form className="groups-form" onSubmit={createGroup}>
              <label className="groups-field">Group name
                <input required maxLength={80} value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="e.g. Evidence study group" />
                <span className="field-hint">Shown to everyone as “{newGroupName.trim() || "Your name"} Law Study Hub”.</span>
              </label>
              <button className="primary-button" type="submit" disabled={busy === "create" || !online}><Plus size={14} /> {busy === "create" ? "Creating…" : "Create a group"}</button>
            </form>
          </section>}
          {!canCreate && <p className="field-hint groups-leader-note">The create form is intentionally hidden until approval; joining a group does not require leader approval.</p>}
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
                </form> : <h2>{studyGroupDisplayName(group.name)}</h2>}
                <p className="groups-count">{members.length} / {memberLimit} members <span>·</span> Leader: {members.find((member) => member.user_id === group.leader_id)?.display_name ?? "Group leader"}</p>
              </div>
              <div className="groups-actions">
                {isLeader && !renameOpen && <button className="secondary-button" onClick={() => { setRenameValue(group.name.replace(/\s+Law Study Hub\s*$/i, "").trim()); setRenameOpen(true); }}>Rename</button>}
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

          <section className="card card-pad groups-announcements-section">
            <div className="card-header"><span className="section-label"><Megaphone size={14} /> Group announcements</span><span className="quiet">Updates from the group leader</span></div>
            {isLeader && <form className="groups-announcement-form" onSubmit={postAnnouncement}>
              <label className="groups-field">Announcement title<input required maxLength={180} value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="e.g. Saturday revision session" /></label>
              <label className="groups-field">Message<textarea required maxLength={8000} rows={4} value={announcementBody} onChange={(event) => setAnnouncementBody(event.target.value)} placeholder="Tell the group what they need to know…" /></label>
              <label className="groups-check"><input type="checkbox" checked={announcementPinned} onChange={(event) => setAnnouncementPinned(event.target.checked)} /> Pin this announcement</label>
              <button className="primary-button" type="submit" disabled={busy === "announcement" || !online}><Megaphone size={14} /> {busy === "announcement" ? "Posting…" : "Post announcement"}</button>
            </form>}
            {!announcements.length ? <p className="empty">No announcements for this group yet.</p> : <div className="groups-announcement-list">{announcements.map((announcement) => <article className="groups-announcement" key={announcement.id}><div className="groups-announcement-head"><div><strong>{announcement.title}</strong><small>{announcement.pinned ? "Pinned · " : ""}{new Date(announcement.created_at).toLocaleString("en-GB")}</small></div>{announcement.pinned && <span className="chip green">Pinned</span>}</div><p>{announcement.body}</p></article>)}</div>}
          </section>

          <section className="card card-pad groups-materials-section">
            <div className="card-header"><span className="section-label">Group materials</span><span className="quiet">Shared resources for this group</span></div>
            {isLeader && <form className="groups-material-share-form" onSubmit={shareMaterial}>
              <div className="groups-session-form-head"><strong>Share a resource</strong><span className="field-hint">Choose a Library item or upload your own file, then decide who should see it.</span></div>
              <div className="groups-material-source-tabs" role="tablist" aria-label="Material source">
                <button type="button" className={shareSource === "library" ? "tab active" : "tab"} onClick={() => setShareSource("library")}><Library size={14} /> From Library</button>
                <button type="button" className={shareSource === "upload" ? "tab active" : "tab"} onClick={() => setShareSource("upload")}><FileUp size={14} /> Upload file</button>
              </div>
              <label className="groups-field">What are you sharing?<select value={shareKind} onChange={(event) => setShareKind(event.target.value as GroupMaterialContentKind)}><option value="resource">Study resource</option><option value="class_recording">Class recording</option><option value="discussion_recording">Group discussion recording</option></select></label>
              <label className="groups-field">Title<input required maxLength={180} value={shareTitle} onChange={(event) => setShareTitle(event.target.value)} placeholder={shareKind === "resource" ? "e.g. Consideration case brief" : "e.g. Evidence lecture — 9 November"} /></label>
              {shareSource === "library" && shareKind === "resource" ? <label className="groups-field">Library material<select value={shareLibraryId} onChange={(event) => { setShareLibraryId(event.target.value); const material = libraryMaterials.find((item) => item.id === event.target.value); if (material && !shareTitle) setShareTitle(material.title); }}><option value="">Choose a material…</option>{libraryMaterials.map((material) => <option key={material.id} value={material.id}>{material.title} · {material.unit}</option>)}</select></label> : <label className="groups-field">Recording or file<input required type="file" accept={shareKind === "resource" ? undefined : "audio/*,video/*,.mp3,.m4a,.wav,.mp4,.webm"} onChange={(event) => setShareFile(event.target.files?.[0] ?? null)} /><span className="field-hint">Files remain private to this group. Leaders can later push suitable resources to the Library.</span></label>}
              <div className="groups-material-scope-row">
                <label className="groups-field">Share with<select value={shareScope} onChange={(event) => setShareScope(event.target.value as GroupMaterialShareScope)}><option value="group">Entire group</option><option value="session">One session</option><option value="unit">One unit</option></select></label>
                {shareScope === "session" && <label className="groups-field">Session<select required value={shareSessionId} onChange={(event) => setShareSessionId(event.target.value)}><option value="">Choose a session…</option>{sessions.map((session) => <option key={session.id} value={session.id}>{showDate(session.session_date)} · {session.title}</option>)}</select></label>}
                {shareScope === "unit" && <label className="groups-field">Unit<select required value={shareUnitName} onChange={(event) => setShareUnitName(event.target.value)}><option value="">Choose a unit…</option>{units.map((unit) => <option key={unit.id} value={unit.name}>{unit.name}</option>)}</select></label>}
              </div>
              <button className="primary-button" type="submit" disabled={busy === "share-material" || !online}><ExternalLink size={14} /> {busy === "share-material" ? "Sharing…" : "Share with group"}</button>
            </form>}
            {!groupMaterials.length ? <p className="empty">No materials or recordings have been shared with this group yet.</p> : <div className="row-list groups-material-list">{groupMaterials.map((share) => <div className="row" key={share.id}>
              <div className="type-mark">{share.content_kind === "resource" ? <Library size={14} /> : <Video size={14} />}</div>
              <div className="row-main"><div className="row-title">{share.title}</div><div className="row-meta">{share.content_kind === "class_recording" ? "Class recording" : share.content_kind === "discussion_recording" ? "Group discussion recording" : share.source_label} · {share.share_scope === "group" ? "Entire group" : share.share_scope === "session" ? `Session: ${sessions.find((session) => session.id === share.session_id)?.title ?? "Selected session"}` : `Unit: ${share.unit_name}`}</div></div>
              {share.url && <a className="secondary-button" href={share.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open</a>}
              {isLeader && !share.material_id && !share.library_material_id && <button className="secondary-button" disabled={busy === `publish-${share.id}` || !online} onClick={() => publishGroupMaterial(share)}><Library size={13} /> {busy === `publish-${share.id}` ? "Publishing…" : "Push to Library"}</button>}
              {share.library_material_id && <span className="chip green">In Library</span>}
            </div>)}</div>}
          </section>

          <section className="card card-pad groups-change-request">
            <div className="card-header"><span className="section-label"><Send size={14} /> Improve this group dashboard</span><span className="quiet">Private message to the platform admin</span></div>
            <p className="field-hint">Have an idea for this group’s dashboard? Tell the administrator what you would like added or changed. Only support staff can see this request.</p>
            <form className="groups-request-form" onSubmit={(event) => void requestDashboardChange(event)}>
              <label className="groups-field">What should we change?<textarea required minLength={10} maxLength={8000} rows={4} value={dashboardRequest} onChange={(event) => setDashboardRequest(event.target.value)} placeholder="For example: add a separate moot-court recordings area…" /></label>
              <button className="primary-button" type="submit" disabled={busy === "dashboard-request" || dashboardRequest.trim().length < 10 || !online}><Send size={14} /> {busy === "dashboard-request" ? "Sending…" : "Send to support"}</button>
            </form>
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
                const sessionMaterials = groupMaterials.filter((share) => share.share_scope === "session" && share.session_id === session.id);
                return <article className="groups-session" key={session.id}>
                  <div className="groups-session-head">
                    <div><div className="groups-session-meta"><span>{session.kind === "daily" ? "Daily session" : "Project session"}</span><span>{showDate(session.session_date)}</span><span className={`groups-status ${session.status}`}>{session.status}</span></div><h3>{session.title}</h3>{session.project_label && <p className="row-meta">{session.project_label}</p>}{session.check_in_cutoff && <p className="row-meta">Check-in cutoff · {session.check_in_cutoff.slice(0, 5)} Nairobi time</p>}</div>
                    <div className="groups-actions">
                      {!isLeader && session.status === "open" && !ownRecord && <button className="primary-button" disabled={busy === `checkin-${session.id}` || !online} onClick={() => checkIn(session.id)}><Check size={14} /> {busy === `checkin-${session.id}` ? "Checking in…" : "Check in"}</button>}
                      {!isLeader && ownRecord && <span className="chip">Your record: {attendanceLabel(ownRecord.status)}</span>}
                      {isLeader && session.status === "open" && <button className="secondary-button" disabled={busy === `close-${session.id}` || !online} onClick={() => void act(`close-${session.id}`, () => repository.closeGroupSession(session.id), "Session closed.")}><Check size={14} /> Close session</button>}
                      {isLeader && <button className="secondary-button" disabled={busy === `clear-${session.id}` || !online} onClick={() => clearAttendance(session)}>{busy === `clear-${session.id}` ? "Clearing…" : "Clear attendance"}</button>}
                      {isLeader && <button className="small-danger" disabled={busy === `delete-session-${session.id}` || !online} onClick={() => { if (window.confirm("Delete this session and its attendance records?")) void act(`delete-session-${session.id}`, () => repository.deleteGroupSession(session.id), "Session deleted."); }}><Trash2 size={13} /> Delete</button>}
                    </div>
                  </div>
                  {sessionMaterials.length > 0 && <div className="groups-session-materials">
                    <div className="section-label">Materials for this session</div>
                    <div className="groups-session-material-list">{sessionMaterials.map((share) => <div className="groups-session-material" key={share.id}>
                      <span className="groups-session-material-title"><Library size={13} /> {share.title}</span>
                      {share.url && <a className="material-link" href={share.url} target="_blank" rel="noreferrer">Open resource <ExternalLink size={12} /></a>}
                    </div>)}</div>
                  </div>}
                  {isLeader && <div className="groups-mark-grid">
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
            <div className="card-header"><div><span className="section-label">Attendance summary</span><span className="quiet">Visibility only · no effect on marks</span></div>{isLeader && <button className="secondary-button" type="button" onClick={exportAttendance} disabled={!summary.length}><Download size={14} /> Download selected period</button>}</div>
            <div className="groups-date-range"><label className="groups-field">From<input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="groups-field">To<input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} /></label></div>
            {isLeader && <p className="field-hint">Choose the dates first. The download will contain this group’s member attendance summary for exactly that period.</p>}
            <div className="table-wrap"><table className="table groups-summary-table"><thead><tr><th>Member</th><th>Sessions held</th><th>Present</th><th>Late</th><th>Excused</th><th>Absent</th><th>Attendance</th><th>Last active</th></tr></thead><tbody>{summary.map((item) => <tr key={item.user_id}><td>{item.display_name}</td><td>{item.sessions_held}</td><td>{item.present}</td><td>{item.late}</td><td>{item.excused}</td><td>{item.absent}</td><td>{item.attendance_percentage}%</td><td>{showDate(item.last_active_date)}</td></tr>)}</tbody></table></div>
            {!summary.length && <p className="empty">No attendance summary is available for this date range yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
