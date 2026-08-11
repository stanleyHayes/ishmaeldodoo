"use client";

import type {
  AuthenticationAuditIntegrity,
  AuthenticationAuditItem,
} from "@amanor/contracts";
import { useEffect, useState } from "react";
import {
  getAuthenticationAuditIntegrity,
  listAuthenticationAudit,
} from "../../lib/api/client";

const eventLabels: Record<AuthenticationAuditItem["type"], string> = {
  login_succeeded: "Login succeeded",
  login_failed: "Login failed",
  session_refreshed: "Session refreshed",
  session_revoked: "Session revoked",
  refresh_token_reuse: "Refresh-token reuse",
  role_changed: "Roles changed",
  password_changed: "Password changed",
  mfa_challenged: "MFA challenged",
  mfa_recovered: "MFA recovered",
  recovery_codes_rotated: "Recovery codes rotated",
  user_disabled: "Account disabled",
  user_enabled: "Account enabled",
  user_invited: "Administrator invited",
  invitation_accepted: "Invitation accepted",
  privileged_data_read: "Privileged data read",
  hardware_key_enrolled: "Security key enrolled",
  hardware_key_authenticated: "Security key authenticated",
  hardware_key_revoked: "Security key revoked",
};

export function AuthenticationAudit() {
  const [items, setItems] = useState<readonly AuthenticationAuditItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [integrity, setIntegrity] =
    useState<AuthenticationAuditIntegrity | null>(null);

  useEffect(() => {
    void Promise.all([
      listAuthenticationAudit(),
      getAuthenticationAuditIntegrity(),
    ]).then(
      ([page, integrityResult]) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        setIntegrity(integrityResult);
        setState("ready");
      },
      () => setState("error"),
    );
  }, []);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await listAuthenticationAudit(cursor);
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setState("error");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section
      className="session-panel"
      aria-labelledby="authentication-audit-title"
    >
      <div className="session-heading">
        <div>
          <p className="section-context">Security evidence</p>
          <h2 id="authentication-audit-title">
            Security and data-access audit
          </h2>
          <p>
            Integrity-chained account events and successful privileged reads.
            Secrets, request parameters, network fingerprints and session
            identifiers are excluded.
          </p>
        </div>
      </div>
      {state === "loading" ? (
        <p role="status">Loading authentication events…</p>
      ) : null}
      {integrity ? (
        <p
          className={`integrity-state integrity-state--${integrity.status}`}
          role={integrity.status === "invalid" ? "alert" : "status"}
        >
          Chain integrity: {integrity.status}. {integrity.checkedEvents} events
          checked.
        </p>
      ) : null}
      {state === "error" ? (
        <p role="alert">Authentication events could not be loaded.</p>
      ) : null}
      {state === "ready" && items.length === 0 ? (
        <p>No authentication events were returned.</p>
      ) : null}
      {items.length > 0 ? (
        <div
          className="table-scroll"
          tabIndex={0}
          aria-label="Security and data-access event history"
        >
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Outcome</th>
                <th>Actor</th>
                <th>Subject</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.eventId}>
                  <td>
                    <time dateTime={item.occurredAt.toISOString()}>
                      {item.occurredAt.toLocaleString()}
                    </time>
                  </td>
                  <td>{eventLabels[item.type]}</td>
                  <td>{item.outcome}</td>
                  <td>{item.actorId ?? "System"}</td>
                  <td>{item.subjectId ?? "—"}</td>
                  <td>{item.reason?.replaceAll("_", " ") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {cursor ? (
        <button
          type="button"
          className="secondary-button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading events" : "Load older events"}
        </button>
      ) : null}
    </section>
  );
}
