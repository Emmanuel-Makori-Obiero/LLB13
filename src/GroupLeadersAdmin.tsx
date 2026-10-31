import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { repository } from "./data/repository";
import type { ApprovedGroupLeader } from "./data/types";
import "./groups.css";

export default function GroupLeadersAdmin() {
  const [leaders, setLeaders] = useState<ApprovedGroupLeader[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setLeaders(await repository.adminListGroupLeaders());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load approved leaders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

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
        <span className="quiet">Primary admin</span>
      </div>
      <p className="field-hint">Approve a registered account to create one study group. Removing approval does not delete a group that already exists.</p>
      {error && <div className="connection-error" role="alert">{error}</div>}
      {message && <p className="field-hint" role="status">{message}</p>}
      <form className="groups-admin-form" onSubmit={submit}>
        <label className="groups-field">
          Account email
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" />
        </label>
        <button className="primary-button" type="submit" disabled={busy}>
          <UserPlus size={14} /> {busy ? "Saving…" : "Approve leader"}
        </button>
      </form>
      {loading ? <p className="field-hint">Loading approved leaders…</p> : !leaders.length ? <p className="empty">No approved group leaders yet.</p> : (
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
