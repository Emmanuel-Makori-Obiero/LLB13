import { useEffect, useState, type FormEvent } from "react";
import { Check, ShieldCheck, ShieldOff, UserPlus, X } from "lucide-react";
import { repository } from "./data/repository";
import type { ApprovedGroupLeader, GroupLeaderRequest } from "./data/types";
import "./groups.css";

export default function GroupLeadersAdmin() {
  const [leaders, setLeaders] = useState<ApprovedGroupLeader[]>([]);
  const [requests, setRequests] = useState<GroupLeaderRequest[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [approved, incoming] = await Promise.all([repository.adminListGroupLeaders(), repository.adminListGroupLeaderRequests()]);
      setLeaders(approved);
      setRequests(incoming);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load approved leaders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const reviewRequest = async (request: GroupLeaderRequest, decision: "approved" | "rejected") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await repository.adminReviewGroupLeaderRequest(request.id, decision);
      setMessage(decision === "approved" ? `${request.email} can now create a study group.` : `${request.email}'s request was rejected.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not review the group-leader request.");
    } finally {
      setBusy(false);
    }
  };

  const changeLeader = async (address: string, enabled: boolean) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await repository.adminSetGroupLeaderEmail(address, enabled);
      setMessage(enabled ? `${address} can now create a study group.` : `${address} is no longer an approved group leader.`);
      setEmail("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update group leader access.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (address) void changeLeader(address, true);
  };

  return (
    <section className="card card-pad groups-admin-panel" aria-labelledby="approved-group-leaders-heading">
      <div className="card-header">
        <span id="approved-group-leaders-heading" className="section-label">Approved group leaders</span>
        <span className="quiet">Administrators</span>
      </div>
      <p className="field-hint">Add a verified account here to let that student create one study group. Removing approval does not delete a group that already exists. Campus representatives and other authorized administrators can approve or remove group-leader access here.</p>
      {error && <div className="connection-error" role="alert">{error}</div>}
      {message && <p className="field-hint" role="status">{message}</p>}
      <div className="groups-request-admin">
        <div className="card-header"><span className="section-label">Incoming requests</span><span className="quiet">{requests.filter((request) => request.status === "pending").length} pending</span></div>
        {!requests.some((request) => request.status === "pending") ? <p className="empty">No pending group-leader requests.</p> : <div className="row-list">
          {requests.filter((request) => request.status === "pending").map((request) => <div className="row" key={request.id}>
            <div className="type-mark"><UserPlus size={15} /></div>
            <div className="row-main"><div className="row-title">{request.display_name || request.email?.split("@")[0] || "Student"}</div><div className="row-meta">{request.email} · {new Date(request.created_at).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}</div>{request.message && <p className="groups-request-message">{request.message}</p>}</div>
            <div className="row-end"><button className="primary-button" type="button" disabled={busy} onClick={() => void reviewRequest(request, "approved")}><Check size={12} /> Approve</button><button className="small-danger" type="button" disabled={busy} onClick={() => void reviewRequest(request, "rejected")}><X size={12} /> Reject</button></div>
          </div>)}
        </div>}
      </div>
      <form className="groups-admin-form" onSubmit={submit}>
        <label className="groups-field">
          Account email
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" />
        </label>
        <button className="primary-button" type="submit" disabled={busy}>
          <UserPlus size={14} /> {busy ? "Saving…" : "Approve leader"}
        </button>
      </form>
      {loading ? <p className="field-hint">Loading approved leaders…</p> : !leaders.length ? <p className="empty">No group-leader approvals have been granted yet. Use the form above when a student requests access.</p> : (
        <div className="row-list">
          {leaders.map((leader) => (
            <div className="row" key={leader.user_id}>
              <div className="type-mark"><ShieldCheck size={15} /></div>
              <div className="row-main">
                <div className="row-title">{leader.display_name || leader.email.split("@")[0]}</div>
                <div className="row-meta">{leader.email}</div>
              </div>
              <div className="row-end">
                <button className="small-danger" type="button" disabled={busy} onClick={() => {
                  if (window.confirm(`Remove group leader approval from ${leader.email}? Their existing group will remain.`))
                    void changeLeader(leader.email, false);
                }}>
                  <ShieldOff size={12} /> Remove approval
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
