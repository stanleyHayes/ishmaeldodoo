"use client";

import { adminRoles, type AdministratorSummary } from "@amanor/contracts";
import { useCallback, useEffect, useState } from "react";
import { AdminSelect } from "../ui/admin-select";
import {
  changeAdministratorRoles,
  inviteAdministrator,
  listAdministrators,
  setAdministratorDisabled,
} from "../../lib/api/client";

const labels = Object.fromEntries(
  adminRoles.map((role) => [role, role.replaceAll("_", " ")]),
) as Record<(typeof adminRoles)[number], string>;

export function AdministratorManager({
  currentUserId,
}: Readonly<{ currentUserId: string }>) {
  const [users, setUsers] = useState<readonly AdministratorSummary[]>([]);
  const [draftRoles, setDraftRoles] = useState<
    Record<string, AdministratorSummary["roles"]>
  >({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [working, setWorking] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    setMessage(null);
    void listAdministrators().then(
      (result) => {
        setUsers(result);
        setDraftRoles(
          Object.fromEntries(result.map((user) => [user.userId, user.roles])),
        );
        setStatus("ready");
      },
      () => setStatus("error"),
    );
  }, []);

  useEffect(() => {
    void listAdministrators().then(
      (result) => {
        setUsers(result);
        setDraftRoles(
          Object.fromEntries(result.map((user) => [user.userId, user.roles])),
        );
        setStatus("ready");
      },
      () => setStatus("error"),
    );
  }, []);

  function replace(user: AdministratorSummary) {
    setUsers((current) =>
      current.map((item) => (item.userId === user.userId ? user : item)),
    );
    setDraftRoles((current) => ({ ...current, [user.userId]: user.roles }));
  }

  async function saveRoles(userId: string) {
    const roles = draftRoles[userId] ?? [];
    if (roles.length === 0) {
      setMessage("Every administrator must retain at least one role.");
      return;
    }
    setWorking(userId);
    setMessage(null);
    try {
      replace(await changeAdministratorRoles(userId, roles));
      setMessage("Roles saved. Existing sessions were revoked.");
    } catch {
      setMessage("Roles could not be saved. Refresh and try again.");
    } finally {
      setWorking(null);
    }
  }

  async function setDisabled(userId: string, disabled: boolean) {
    setWorking(userId);
    setMessage(null);
    try {
      replace(await setAdministratorDisabled(userId, disabled));
      setConfirmDisable(null);
      setMessage(
        disabled
          ? "Account disabled and existing sessions revoked."
          : "Account re-enabled. A fresh sign-in is required.",
      );
    } catch {
      setMessage("Account status could not be changed. Refresh and try again.");
    } finally {
      setWorking(null);
    }
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("invitation");
    setMessage(null);
    setInvitationUrl(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const result = await inviteAdministrator({
        email: String(data.get("email") ?? ""),
        roles: [
          String(data.get("role") ?? "editor") as (typeof adminRoles)[number],
        ],
      });
      setUsers((current) => [...current, result.administrator]);
      setDraftRoles((current) => ({
        ...current,
        [result.administrator.userId]: result.administrator.roles,
      }));
      setInvitationUrl(
        `${window.location.origin}/?invitation=${encodeURIComponent(result.invitationToken)}`,
      );
      setMessage(
        "Invitation created. Share the one-time link through an approved secure channel.",
      );
      form.reset();
    } catch {
      setMessage(
        "Invitation could not be created. Check the address and try again.",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="session-panel" aria-labelledby="administrators-title">
      <div className="session-heading">
        <div>
          <p className="section-context">Access governance</p>
          <h2 id="administrators-title">Administrators</h2>
          <p>
            Role or status changes invalidate every session for the affected
            account. Principal changes require the break-glass procedure.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={load}>
          Refresh
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <form className="administrator-invitation" onSubmit={invite}>
        <div className="field">
          <label htmlFor="invitation-email">Administrator email</label>
          <input
            id="invitation-email"
            name="email"
            type="email"
            required
            maxLength={254}
            disabled={working === "invitation"}
          />
        </div>
        <div className="field">
          <AdminSelect
            label="Initial role"
            name="role"
            defaultValue="editor"
            disabled={working === "invitation"}
          >
            {adminRoles
              .filter((role) => role !== "principal")
              .map((role) => (
                <option key={role} value={role}>
                  {labels[role]}
                </option>
              ))}
          </AdminSelect>
        </div>
        <button type="submit" disabled={working === "invitation"}>
          {working === "invitation"
            ? "Creating invitation"
            : "Invite administrator"}
        </button>
      </form>
      {invitationUrl ? (
        <div className="field">
          <label htmlFor="invitation-link">One-time invitation link</label>
          <textarea
            id="invitation-link"
            readOnly
            rows={3}
            value={invitationUrl}
          />
          <p className="field-help">
            This link expires after 24 hours and is shown only in this browser
            session.
          </p>
        </div>
      ) : null}
      {status === "loading" ? (
        <div className="session-skeleton" aria-label="Loading administrators">
          <span />
          <span />
        </div>
      ) : status === "error" ? (
        <div className="session-state" role="alert">
          Administrator accounts could not be loaded.
        </div>
      ) : (
        <ul className="administrator-list">
          {users.map((user) => {
            const ownAccount = user.userId === currentUserId;
            const principal = user.roles.includes("principal");
            const immutable = ownAccount || principal;
            return (
              <li key={user.userId}>
                <div>
                  <strong>{user.emailCanonical}</strong>
                  <code>{user.userId}</code>
                  <span>{user.disabledAt ? "Disabled" : "Active"}</span>
                </div>
                <fieldset disabled={immutable || working === user.userId}>
                  <legend>Assigned roles</legend>
                  {adminRoles.map((role) => (
                    <label key={role}>
                      <input
                        type="checkbox"
                        checked={(draftRoles[user.userId] ?? []).includes(role)}
                        onChange={(event) =>
                          setDraftRoles((current) => {
                            const selected = current[user.userId] ?? [];
                            return {
                              ...current,
                              [user.userId]: event.target.checked
                                ? [...selected, role]
                                : selected.filter((item) => item !== role),
                            };
                          })
                        }
                      />
                      {labels[role]}
                    </label>
                  ))}
                </fieldset>
                <div className="administrator-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={immutable || working === user.userId}
                    onClick={() => void saveRoles(user.userId)}
                  >
                    Save roles
                  </button>
                  {user.disabledAt ? (
                    <button
                      type="button"
                      disabled={immutable || working === user.userId}
                      onClick={() => void setDisabled(user.userId, false)}
                    >
                      Re-enable account
                    </button>
                  ) : confirmDisable === user.userId ? (
                    <>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={working === user.userId}
                        onClick={() => void setDisabled(user.userId, true)}
                      >
                        Confirm disable
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setConfirmDisable(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="danger-button"
                      disabled={immutable || working === user.userId}
                      onClick={() => setConfirmDisable(user.userId)}
                    >
                      Disable account
                    </button>
                  )}
                </div>
                {ownAccount ? (
                  <p>Your own access cannot be changed here.</p>
                ) : null}
                {principal ? (
                  <p>Principal governance requires break-glass review.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
