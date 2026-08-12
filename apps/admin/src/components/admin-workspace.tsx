"use client";

import type { AuthSessionResponse, LoginRequest } from "@amanor/contracts";
import Link from "next/link";
import { useState } from "react";
import { ApiClientError, login, logout } from "../lib/api/client";
import { SessionManager } from "./security/session-manager";
import { AdministratorManager } from "./security/administrator-manager";
import { AuthenticationAudit } from "./security/authentication-audit";
import { StepUpPanel } from "./security/step-up-panel";
import { ContentWorkspace } from "./content/content-workspace";
import { ProtocolDeskWorkspace } from "./protocol/protocol-desk-workspace";
import { MediaWorkspace } from "./media/media-workspace";
import { SegmentedCodeInput } from "./security/segmented-code-input";

const MFA_CODE_LENGTH = 6;
const RECOVERY_CODE_LENGTH = 19;

type AdminRole = AuthSessionResponse["user"]["roles"][number];
type AdminUser = AuthSessionResponse["user"];

const roleLabels: Record<AdminRole, string> = {
  principal: "Principal",
  desk_officer: "Desk officer",
  editor: "Editor",
  translator: "Translator",
  reviewer: "Reviewer",
  press_officer: "Press officer",
  trust_admin: "Trust administrator",
  security_admin: "Security administrator",
};

const navigation = [
  {
    id: "overview",
    label: "Overview",
    description: "Publishing readiness and assigned work",
    roles: [
      "principal",
      "desk_officer",
      "editor",
      "translator",
      "reviewer",
      "press_officer",
      "trust_admin",
      "security_admin",
    ],
  },
  {
    id: "content",
    label: "Content",
    description: "Identity, pages, sources and editorial workflow",
    roles: ["principal", "editor", "translator", "reviewer"],
  },
  {
    id: "media",
    label: "Media",
    description: "Governed portraits, field archive and transcripts",
    roles: ["principal", "editor", "press_officer"],
  },
  {
    id: "protocol",
    label: "Protocol Desk",
    description: "Engagement intake and correspondence",
    roles: ["principal", "desk_officer"],
  },
  {
    id: "legacy",
    label: "Legacy",
    description: "Scholar consent and giving records",
    roles: ["principal", "trust_admin"],
  },
  {
    id: "security",
    label: "Security",
    description: "Sessions, roles and audit review",
    roles: ["principal", "security_admin"],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  roles: readonly AdminRole[];
}[];

function hasAnyRole(
  userRoles: readonly AdminRole[],
  allowedRoles: readonly AdminRole[],
) {
  return userRoles.some((role) => allowedRoles.includes(role));
}

function messageFor(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 401) {
    return "Sign-in failed. Check your credentials and verification code, then try again.";
  }
  return "The administration service is unavailable. Please try again shortly.";
}

function LoginForm({
  onAuthenticated,
}: Readonly<{ onAuthenticated: (user: AdminUser) => void }>) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const codeComplete =
    code.length === (useRecovery ? RECOVERY_CODE_LENGTH : MFA_CODE_LENGTH);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const input: LoginRequest = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      ...(useRecovery
        ? { recoveryCode: String(formData.get("recoveryCode") ?? "") }
        : { mfaCode: String(formData.get("mfaCode") ?? "") }),
    };
    try {
      const session = await login(input);
      form.reset();
      onAuthenticated(session.user);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-introduction">
          <p className="product-mark">Project AMANOR</p>
          <h1 id="login-title">Administration</h1>
          <p>
            Protected editorial and operations access. Use your issued account
            and authenticator code.
          </p>
        </div>
        <form
          className="login-form"
          onSubmit={handleSubmit}
          aria-busy={submitting}
        >
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={submitting}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={14}
              required
              disabled={submitting}
            />
          </div>
          {useRecovery ? (
            <div className="field field--code">
              <span className="field-label" id="recoveryCode-label">
                Single-use recovery code
              </span>
              <SegmentedCodeInput
                name="recoveryCode"
                labelId="recoveryCode-label"
                describedById="recoveryCode-help"
                groups={[4, 4, 4, 4]}
                separator="-"
                inputMode="text"
                allow={/[A-Z2-9]/}
                transform={(raw) => raw.toUpperCase()}
                disabled={submitting}
                onValueChange={setCode}
              />
              <p className="field-help" id="recoveryCode-help">
                Enter one unused recovery code.
              </p>
            </div>
          ) : (
            <div className="field field--code">
              <span className="field-label" id="mfaCode-label">
                Authenticator code
              </span>
              <SegmentedCodeInput
                name="mfaCode"
                labelId="mfaCode-label"
                describedById="mfaCode-help"
                groups={[6]}
                disabled={submitting}
                onValueChange={setCode}
              />
              <p className="field-help" id="mfaCode-help">
                Enter the current six-digit code.
              </p>
            </div>
          )}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setUseRecovery((current) => !current);
              setCode("");
            }}
            disabled={submitting}
          >
            {useRecovery ? "Use authenticator instead" : "Use a recovery code"}
          </button>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="primary-button"
            type="submit"
            disabled={submitting || !codeComplete}
          >
            {submitting ? "Checking credentials" : "Sign in"}
          </button>
        </form>
      </section>
      <p className="access-notice">
        Access is logged. Unauthorised use may be investigated.
      </p>
    </main>
  );
}

function OperatorShell({
  user,
  onSignedOut,
}: Readonly<{ user: AdminUser; onSignedOut: () => void }>) {
  const allowedNavigation = navigation.filter((item) =>
    hasAnyRole(user.roles, item.roles),
  );
  const [activeId, setActiveId] = useState(
    allowedNavigation[0]?.id ?? "overview",
  );
  const [signingOut, setSigningOut] = useState(false);
  const active =
    allowedNavigation.find((item) => item.id === activeId) ??
    allowedNavigation[0];

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // The API client clears in-memory access even if server confirmation fails.
    } finally {
      onSignedOut();
    }
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <p className="product-mark">Project AMANOR</p>
          <p className="console-name">Administration</p>
        </div>
        <nav className="admin-navigation" aria-label="Administration sections">
          {allowedNavigation.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === active?.id ? "page" : undefined}
              onClick={() => setActiveId(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>
        <div className="operator-card">
          <p className="operator-id">{user.id}</p>
          <div className="role-list" aria-label="Assigned roles">
            {user.roles.map((role) => (
              <span key={role}>{roleLabels[role]}</span>
            ))}
          </div>
          {user.roles.includes("principal") ? (
            <Link className="text-button" href="/room">
              Open The Room
            </Link>
          ) : null}
          <button
            className="text-button"
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out" : "Sign out"}
          </button>
        </div>
      </aside>

      <section className="admin-content" aria-labelledby="workspace-title">
        <header className="workspace-header">
          <div>
            <p className="section-context">Protected workspace</p>
            <h1 id="workspace-title">{active?.label ?? "Overview"}</h1>
            <p>{active?.description}</p>
          </div>
          <span className="access-state">Authenticated</span>
        </header>

        {active?.id === "security" ? (
          <>
            <SessionManager />
            <StepUpPanel />
            <AdministratorManager currentUserId={user.id} />
            <AuthenticationAudit />
          </>
        ) : active?.id === "content" ? (
          <ContentWorkspace roles={user.roles} />
        ) : active?.id === "media" ? (
          <MediaWorkspace />
        ) : active?.id === "protocol" ? (
          <ProtocolDeskWorkspace roles={user.roles} />
        ) : (
          <>
            <div className="status-grid" aria-label="Workspace status">
              <article>
                <p>Publishing</p>
                <strong>Editorial controls active</strong>
                <span>Review and source validation apply before release.</span>
              </article>
              <article>
                <p>Translation</p>
                <strong>Parity tracked by field</strong>
                <span>
                  Missing or stale French content remains visible to editors.
                </span>
              </article>
              <article>
                <p>Access</p>
                <strong>
                  {user.roles.length} assigned{" "}
                  {user.roles.length === 1 ? "role" : "roles"}
                </strong>
                <span>
                  Navigation is limited to the current account permissions.
                </span>
              </article>
            </div>

            <section className="work-queue" aria-labelledby="queue-title">
              <div>
                <p className="section-context">Current queue</p>
                <h2 id="queue-title">No assigned items</h2>
              </div>
              <p>
                Assigned drafts, reviews and operational requests will appear
                here when their API views are enabled.
              </p>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

export function AdminWorkspace() {
  const [user, setUser] = useState<AdminUser | null>(null);
  return user ? (
    <OperatorShell user={user} onSignedOut={() => setUser(null)} />
  ) : (
    <LoginForm onAuthenticated={setUser} />
  );
}
