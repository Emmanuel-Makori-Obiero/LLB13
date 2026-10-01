import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { repository } from "./data/repository";
import type { AdminAccount, Member, Unit } from "./data/types";
import { unitReps } from "./data/types";
import "./admin.css";

type Props = {
  units: Unit[];
  members: Member[];
  currentEmail: string;
  setNotice: (notice: string) => void;
  onUnitAdded?: (unit: Unit) => void;
  onUnitRemoved?: (id: string) => void;
};

const TONES = [
  "#8F3E32",
  "#163A34",
  "#6E7D63",
  "#C96E52",
  "#536C75",
  "#9E7C46",
];
const splitUnits = (value: string) =>
  value
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "never";

export default function AdminPage({
  units,
  members,
  currentEmail,
  setNotice,
  onUnitAdded,
  onUnitRemoved,
}: Props) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("Member");
  const [newSection, setNewSection] = useState<"A" | "B">("A");
  const [unitName, setUnitName] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const addUnit = async () => {
    if (!unitName.trim() || !unitCode.trim()) {
      setNotice("Enter the unit name and code.");
      return;
    }
    try {
      const created = await repository.adminCreateUnit({
        name: unitName.trim(),
        code: unitCode.trim(),
        lead: "To be assigned",
      });
      onUnitAdded?.(created);
      setUnitName("");
      setUnitCode("");
      setNotice(`${created.name} added.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not add unit.");
    }
  };
  const removeUnit = async (unit: Unit) => {
    if (
      !window.confirm(
        `Remove ${unit.name}? Materials and assignments keep their text but lose this unit.`,
      )
    )
      return;
    try {
      await repository.adminDeleteUnit(unit.id);
      onUnitRemoved?.(unit.id);
      setNotice(`${unit.name} removed.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not remove unit.");
    }
  };

  const run = useCallback(
    async (action: () => Promise<void>, success: string) => {
      try {
        await action();
        setNotice(success);
      } catch (caught) {
        setNotice(
          caught instanceof Error ? caught.message : "Something went wrong.",
        );
      }
    },
    [setNotice],
  );

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await repository.adminListAccounts());
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load accounts.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const removeAccount = (account: AdminAccount) => {
    if (
      !window.confirm(
        `Remove ${account.display_name || account.email}? Their login, to-dos, media and uploaded files will be deleted permanently.`,
      )
    )
      return;
    void run(async () => {
      await repository.adminRemoveAccount(account.id);
      setAccounts((current) =>
        current.filter((item) => item.id !== account.id),
      );
    }, "Account removed.");
  };

  const toggleUnit = (member: Member, unitName: string) => {
    const current = splitUnits(member.units);
    const next = current.includes(unitName)
      ? current.filter((name) => name !== unitName)
      : [...current, unitName];
    void run(
      () =>
        repository.adminUpdateMember(member.name, { units: next.join(" · ") }),
      `${member.name}: units updated.`,
    );
  };

  const addMember = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    void run(async () => {
      await repository.adminCreateMember({
        name,
        initials: initialsOf(name),
        role: newRole.trim() || "Member",
        units: "",
        progress: 0,
        tone: TONES[members.length % TONES.length],
        section: newSection,
      });
      setNewName("");
    }, `${name} added to the roster.`);
  };

  const removeMember = (member: Member) => {
    if (!window.confirm(`Remove ${member.name} from the roster?`)) return;
    void run(
      () => repository.adminDeleteMember(member.name),
      `${member.name} removed from the roster.`,
    );
  };

  const addableMembers = (unit: Unit) => {
    const current = unitReps(unit);
    return members
      .map((member) => member.name)
      .filter((name) => !current.includes(name));
  };
  const addRepresentative = (unit: Unit, name: string) => {
    if (!name) return;
    void run(
      () =>
        repository.adminUpdateUnitRepresentatives(unit.id, [
          ...unitReps(unit),
          name,
        ]),
      `${name} is now a representative for ${unit.name}.`,
    );
  };
  const removeRepresentative = (unit: Unit, name: string) => {
    void run(
      () =>
        repository.adminUpdateUnitRepresentatives(
          unit.id,
          unitReps(unit).filter((rep) => rep !== name),
        ),
      `${name} removed from ${unit.name}.`,
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Super admin</div>
          <h1>Oversight.</h1>
          <p className="subheading">
            See every account, assign units, manage the roster, and remove
            members. Signed in as {currentEmail}.
          </p>
        </div>
      </div>

      <div className="admin-stack">
        <div className="card card-pad">
          <div className="card-header">
            <span className="section-label">Registered accounts</span>
            <span className="quiet">
              {loading ? "Loading…" : `${accounts.length} accounts`}
            </span>
          </div>
          {error && (
            <div className="connection-error">
              <strong>Could not load accounts</strong>
              <span>
                {error} Run supabase/admin.sql in the Supabase SQL Editor.
              </span>
            </div>
          )}
          <div className="row-list">
            {accounts.map((account) => {
              const isSelf =
                account.email.toLowerCase() === currentEmail.toLowerCase();
              return (
                <div className="row" key={account.id}>
                  <div className="type-mark">
                    {initialsOf(account.display_name || account.email)}
                  </div>
                  <div className="row-main">
                    <div className="row-title">
                      {account.display_name || account.email.split("@")[0]}
                    </div>
                    <div className="row-meta">
                      {account.email} · joined {formatDate(account.created_at)}{" "}
                      · last seen {formatDate(account.last_sign_in_at)}
                    </div>
                  </div>
                  <div className="row-end">
                    {isSelf ? (
                      <span className="chip green">You</span>
                    ) : (
                      <button
                        className="small-danger"
                        onClick={() => removeAccount(account)}
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!loading && !accounts.length && !error && (
            <div className="empty">No accounts yet.</div>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-header">
            <span className="section-label">Roster and unit assignments</span>
            <span className="quiet">{members.length} members</span>
          </div>
          {members.map((member) => {
            const assigned = splitUnits(member.units);
            return (
              <div className="admin-member" key={member.name}>
                <div className="admin-member-head">
                  <div>
                    <div className="member-name">{member.name}</div>
                    <div className="member-role">
                      Section {member.section ?? "A"} · {member.role}
                    </div>
                  </div>
                  <div className="admin-inline">
                    <select
                      value={member.section ?? "A"}
                      onChange={(event) =>
                        void run(
                          () =>
                            repository.adminUpdateMember(member.name, {
                              section: event.target.value as "A" | "B",
                            }),
                          `${member.name}: section updated.`,
                        )
                      }
                    >
                      <option value="A">Section A</option>
                      <option value="B">Section B</option>
                    </select>
                    <input
                      defaultValue={member.role}
                      aria-label={`Role for ${member.name}`}
                      onBlur={(event) => {
                        const role = event.target.value.trim();
                        if (role && role !== member.role)
                          void run(
                            () =>
                              repository.adminUpdateMember(member.name, {
                                role,
                              }),
                            `${member.name}: role updated.`,
                          );
                      }}
                    />
                    <button
                      className="small-danger"
                      onClick={() => removeMember(member)}
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                </div>
                <div className="unit-toggle-row">
                  {units.map((unit) => (
                    <button
                      key={unit.id}
                      className={`unit-toggle ${assigned.includes(unit.name) ? "on" : ""}`}
                      onClick={() => toggleUnit(member, unit.name)}
                    >
                      {unit.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {!members.length && (
            <div className="empty">No one is on the roster yet.</div>
          )}

          <form
            className="admin-inline"
            style={{ marginTop: 18 }}
            onSubmit={addMember}
          >
            <input
              required
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New member name, e.g. Amina M."
            />
            <input
              value={newRole}
              onChange={(event) => setNewRole(event.target.value)}
              placeholder="Role"
            />
            <select
              value={newSection}
              onChange={(event) =>
                setNewSection(event.target.value as "A" | "B")
              }
            >
              <option value="A">Section A</option>
              <option value="B">Section B</option>
            </select>
            <button className="primary-button" type="submit">
              <UserPlus size={13} style={{ verticalAlign: "middle" }} /> Add to
              roster
            </button>
          </form>
        </div>

        <div className="card card-pad">
          <div className="card-header">
            <span className="section-label">
              Units and unit representatives
            </span>
          </div>
          <div className="unit-add">
            <input
              placeholder="Unit name, e.g. Constitutional Law"
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
            />
            <input
              placeholder="Code, e.g. LAW 101"
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
            />
            <button className="primary-button" onClick={() => void addUnit()}>
              Add unit
            </button>
          </div>
          {units.length === 0 && (
            <p className="field-hint">
              No units yet. Add the first one above, then assign members to it.
            </p>
          )}
          <div className="row-list">
            {units.map((unit) => (
              <div className="row" key={unit.id}>
                <div
                  className="type-mark"
                  style={{ borderTop: `3px solid ${unit.color}` }}
                >
                  ↗
                </div>
                <div className="row-main">
                  <div className="row-title">{unit.name}</div>
                  <div className="row-meta">{unit.code}</div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 8,
                    }}
                  >
                    {unitReps(unit).length === 0 && (
                      <span className="field-hint">No representatives yet</span>
                    )}
                    {unitReps(unit).map((name) => (
                      <span
                        className="chip"
                        key={name}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {name}
                        <button
                          type="button"
                          aria-label={`Remove ${name} from ${unit.name}`}
                          onClick={() => removeRepresentative(unit, name)}
                          style={{
                            border: 0,
                            background: "transparent",
                            cursor: "pointer",
                            padding: 0,
                            lineHeight: 1,
                            fontSize: 14,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="row-end">
                  <select
                    className="admin-inline"
                    value=""
                    onChange={(event) =>
                      addRepresentative(unit, event.target.value)
                    }
                  >
                    <option value="">+ Add representative</option>
                    {addableMembers(unit).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${unit.name}`}
                    onClick={() => void removeUnit(unit)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
