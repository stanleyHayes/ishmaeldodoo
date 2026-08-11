"use client";

import type { AdminSession } from "@amanor/contracts";
import { useEffect, useState } from "react";
import { listSessions, revokeSession } from "../../lib/api/client";

type SessionState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{
      status: "ready";
      sessions: readonly AdminSession[];
      observedAt: number;
    }>;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function sessionStatus(session: AdminSession, now = Date.now()) {
  if (session.revokedAt) return "Revoked";
  if (session.expiresAt.getTime() <= now) return "Expired";
  if (session.current) return "Current session";
  return "Active";
}

export function SessionManager() {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [loadVersion, setLoadVersion] = useState(0);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let subscribed = true;
    void listSessions().then(
      (sessions) => {
        if (subscribed)
          setState({ status: "ready", sessions, observedAt: Date.now() });
      },
      () => {
        if (subscribed) setState({ status: "error" });
      },
    );
    return () => {
      subscribed = false;
    };
  }, [loadVersion]);

  function retry() {
    setState({ status: "loading" });
    setActionError(null);
    setLoadVersion((value) => value + 1);
  }

  async function revoke(sessionId: string) {
    setRevoking(sessionId);
    setActionError(null);
    try {
      await revokeSession(sessionId);
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              observedAt: current.observedAt,
              sessions: current.sessions.map((session) =>
                session.sessionId === sessionId
                  ? { ...session, revokedAt: new Date() }
                  : session,
              ),
            }
          : current,
      );
    } catch {
      setActionError(
        "The session could not be revoked. Refresh the list and try again.",
      );
    } finally {
      setRevoking(null);
    }
  }

  if (state.status === "loading") {
    return (
      <section
        className="session-panel"
        aria-labelledby="sessions-title"
        aria-busy="true"
      >
        <div className="session-heading">
          <div>
            <p className="section-context">Account security</p>
            <h2 id="sessions-title">Active sessions</h2>
          </div>
        </div>
        <div className="session-skeleton" aria-label="Loading sessions">
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="session-panel" aria-labelledby="sessions-title">
        <div className="session-heading">
          <div>
            <p className="section-context">Account security</p>
            <h2 id="sessions-title">Active sessions</h2>
          </div>
        </div>
        <div className="session-state" role="alert">
          <p>
            Sessions could not be loaded. Your current access has not changed.
          </p>
          <button className="secondary-button" type="button" onClick={retry}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="session-panel" aria-labelledby="sessions-title">
      <div className="session-heading">
        <div>
          <p className="section-context">Account security</p>
          <h2 id="sessions-title">Active sessions</h2>
          <p>
            Review where this account is signed in. Revoking a session
            invalidates its complete refresh-token family.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={retry}>
          Refresh
        </button>
      </div>

      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {state.sessions.length === 0 ? (
        <div className="session-state">
          <p>No sessions were returned for this account.</p>
        </div>
      ) : (
        <ul className="session-list">
          {state.sessions.map((session) => {
            const status = sessionStatus(session, state.observedAt);
            const canRevoke =
              !session.current &&
              !session.revokedAt &&
              session.expiresAt.getTime() > state.observedAt;
            return (
              <li key={session.sessionId}>
                <div className="session-summary">
                  <div>
                    <strong>{status}</strong>
                    <span>
                      {session.authenticationMethods.join(" + ").toUpperCase()}
                    </span>
                  </div>
                  <code>{session.sessionId}</code>
                </div>
                <dl>
                  <div>
                    <dt>Created</dt>
                    <dd>{dateFormatter.format(session.createdAt)} UTC</dd>
                  </div>
                  <div>
                    <dt>Last rotated</dt>
                    <dd>
                      {session.rotatedAt
                        ? `${dateFormatter.format(session.rotatedAt)} UTC`
                        : "Not rotated"}
                    </dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{dateFormatter.format(session.expiresAt)} UTC</dd>
                  </div>
                </dl>
                {canRevoke ? (
                  <button
                    className="danger-button"
                    type="button"
                    disabled={revoking === session.sessionId}
                    onClick={() => void revoke(session.sessionId)}
                  >
                    {revoking === session.sessionId
                      ? "Revoking"
                      : "Revoke session"}
                  </button>
                ) : session.current && !session.revokedAt ? (
                  <p className="current-session-note">
                    Use Sign out to close the current session.
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
