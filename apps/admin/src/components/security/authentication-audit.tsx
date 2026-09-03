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
import { AdminEmptyState, AdminNotice, AdminSkeleton } from "../ui/admin-state";

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

function personLabel(value: string | undefined, fallback: string) {
  return value ? value : fallback;
}

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
        <AdminSkeleton
          variant="content"
          label="Loading authentication events"
        />
      ) : null}
      {integrity ? (
        <div
          className="audit-integrity-card"
          data-status={integrity.status}
          role={integrity.status === "invalid" ? "alert" : "status"}
        >
          <span aria-hidden="true">
            {integrity.status === "valid" ? "✓" : "!"}
          </span>
          <div>
            <strong>
              {integrity.status === "valid"
                ? "Audit chain verified"
                : "Audit chain needs attention"}
            </strong>
            <p>
              Chain integrity: {integrity.status}. {integrity.checkedEvents}{" "}
              events checked.
            </p>
          </div>
        </div>
      ) : null}
      {state === "error" ? (
        <AdminNotice
          tone="error"
          title="We couldn't load the security history"
          description="Refresh this workspace and try again. Existing audit evidence has not been changed."
        />
      ) : null}
      {state === "ready" && items.length === 0 ? (
        <AdminEmptyState
          kind="audit"
          title="No security events yet"
          description="Sign-ins, access changes and protected data reads will appear here when they occur."
        />
      ) : null}
      {items.length > 0 ? (
        <ol
          className="authentication-timeline"
          aria-label="Security and data-access event history"
        >
          {items.map((item) => (
            <li key={item.eventId}>
              <div
                className="authentication-timeline__marker"
                aria-hidden="true"
              />
              <article>
                <header>
                  <div>
                    <time dateTime={item.occurredAt.toISOString()}>
                      {item.occurredAt.toLocaleString()}
                    </time>
                    <h3>{eventLabels[item.type]}</h3>
                  </div>
                  <span className="audit-outcome" data-outcome={item.outcome}>
                    {item.outcome}
                  </span>
                </header>
                <dl>
                  <div>
                    <dt>Actor</dt>
                    <dd>
                      <code>{personLabel(item.actorId, "System")}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Subject</dt>
                    <dd>
                      <code>{personLabel(item.subjectId, "Not recorded")}</code>
                    </dd>
                  </div>
                  <div className="authentication-timeline__reason">
                    <dt>Reason</dt>
                    <dd>
                      {item.reason?.replaceAll("_", " ") ?? "Not recorded"}
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ol>
      ) : null}
      {loadingMore ? (
        <AdminSkeleton variant="rows" label="Loading older security events" />
      ) : null}
      {cursor ? (
        <button
          type="button"
          className="secondary-button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          Load older events
        </button>
      ) : null}
    </section>
  );
}
