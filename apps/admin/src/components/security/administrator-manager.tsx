"use client";

import { adminRoles, type AdministratorSummary } from "@amanor/contracts";
import { useCallback, useEffect, useState } from "react";
import { AdminSelect } from "../ui/admin-select";
import { AdminEmptyState, AdminNotice } from "../ui/admin-state";
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
  const [message, setMessage] = useState<Readonly<{
    tone: "error" | "success" | "information";
    title: string;
    description?: string;
  }> | null>(null);
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
      setMessage({
        tone: "error",
        title: "Choose at least one role",
        description: "Every administrator needs one role to keep access.",
      });
      return;
    }
    setWorking(userId);
    setMessage(null);
    try {
      replace(await changeAdministratorRoles(userId, roles));
      setMessage({
        tone: "success",
        title: "Roles saved",
        description: "Existing sessions were revoked for security.",
      });
    } catch {
      setMessage({
        tone: "error",
        title: "We couldn't save these roles",
        description:
          "Refresh the account list and try again. No access was changed.",
      });
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
      setMessage({
        tone: "success",
        title: disabled ? "Account disabled" : "Account re-enabled",
        description: disabled
          ? "Existing sessions were revoked."
          : "The administrator can sign in again with a fresh session.",
      });
    } catch {
      setMessage({
        tone: "error",
        title: "We couldn't change this account",
        description:
          "Refresh the account list and try again. The current access remains unchanged.",
      });
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
      setMessage({
        tone: "success",
        title: "Invitation created",
        description:
          "Share the one-time link through an approved secure channel.",
      });
      form.reset();
    } catch {
      setMessage({
        tone: "error",
        title: "We couldn't create the invitation",
        description:
          "Check the email address and selected role, then try again.",
      });
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
      {message ? <AdminNotice {...message} /> : null}
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
        <AdminNotice
          tone="error"
          title="We couldn't load administrator accounts"
          description="Check your connection and refresh the list. No account settings were changed."
          action={
            <button className="secondary-button" type="button" onClick={load}>
              Try again
            </button>
          }
        />
      ) : users.length === 0 ? (
        <AdminEmptyState
          kind="work"
          title="No administrator accounts yet"
          description="Invite the first administrator above and choose the smallest role they need."
        />
      ) : (
        <ul className="administrator-list">
          {users.map((user) => {
            const ownAccount = user.userId === currentUserId;
            const principal = user.roles.includes("principal");
            const immutable = ownAccount || principal;
            return (
              <li key={user.userId}>
                <div className="administrator-identity">
                  <span className="administrator-avatar" aria-hidden="true">
                    {user.emailCanonical.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{user.emailCanonical}</strong>
                    <span
                      className="administrator-status"
                      data-disabled={Boolean(user.disabledAt)}
                    >
                      {user.disabledAt ? "Disabled" : "Active"}
                    </span>
                    <details>
                      <summary>Account reference</summary>
                      <code>{user.userId}</code>
                    </details>
                  </div>
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
                {ownAccount || principal ? (
                  <p className="administrator-lock-note">
                    <span aria-hidden="true">i</span>
                    {ownAccount
                      ? "This is your account. Ask another authorised administrator to change it."
                      : "Principal access can only be changed through the break-glass process."}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
