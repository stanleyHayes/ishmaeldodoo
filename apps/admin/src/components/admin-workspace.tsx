"use client";

import type { AuthSessionResponse } from "@amanor/contracts";
import Link from "next/link";
import { useState } from "react";
import {
  ApiClientError,
  beginLogin,
  completeLogin,
  logout,
} from "../lib/api/client";
import { SecurityWorkspace } from "./security/security-workspace";
import { ContentWorkspace } from "./content/content-workspace";
import { ProtocolDeskWorkspace } from "./protocol/protocol-desk-workspace";
import { AmanorMark } from "./amanor-mark";
import { MediaWorkspace } from "./media/media-workspace";
import { SegmentedCodeInput } from "./security/segmented-code-input";
import { AuthFrame } from "./security/auth-frame";

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
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const codeComplete =
    code.length === (useRecovery ? RECOVERY_CODE_LENGTH : MFA_CODE_LENGTH);

  async function handleCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "");
    try {
      const next = await beginLogin(
        email,
        String(formData.get("password") ?? ""),
      );
      form.reset();
      if ("state" in next) {
        setVerifiedEmail(email);
        setChallenge(next.challenge);
      } else {
        // The account has no MFA enrolled — the credentials stage returned a
        // completed session, so sign in directly without a second step.
        onAuthenticated(next.user);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.status === 401
          ? "Sign-in failed. Check your email and password, then try again."
          : messageFor(caught),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setSubmitting(true);
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const session = await completeLogin(
        challenge,
        useRecovery
          ? { recoveryCode: String(formData.get("recoveryCode") ?? "") }
          : { mfaCode: String(formData.get("mfaCode") ?? "") },
      );
      form.reset();
      onAuthenticated(session.user);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Editorial · Protocol · Security"
      title="Administration"
      description="Protected editorial and operations access for the people entrusted with the public record."
    >
      <div className="auth-form-heading">
        <p>{challenge ? "Second step" : "Welcome back"}</p>
        <h2>{challenge ? "Enter your secure code" : "Verify your identity"}</h2>
        <span>
          {challenge
            ? `Password verified for ${verifiedEmail}. Complete multi-factor verification to continue.`
            : "Start with your issued email address and password."}
        </span>
      </div>
      {challenge ? (
        <form
          className="login-form"
          onSubmit={handleVerification}
          aria-busy={submitting}
        >
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
                Enter the current six-digit code from your authenticator app.
              </p>
            </div>
          )}
          <div className="auth-form-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setUseRecovery((current) => !current);
                setCode("");
              }}
              disabled={submitting}
            >
              {useRecovery
                ? "Use authenticator instead"
                : "Use a recovery code"}
            </button>
            <button
              className="text-button text-button--muted"
              type="button"
              onClick={() => {
                setChallenge(null);
                setVerifiedEmail("");
                setUseRecovery(false);
                setCode("");
                setError(null);
              }}
              disabled={submitting}
            >
              Use another account
            </button>
          </div>
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
            {submitting ? "Verifying code" : "Continue to console"}
          </button>
        </form>
      ) : (
        <form
          className="login-form"
          onSubmit={handleCredentials}
          aria-busy={submitting}
        >
          <div className="field">
            <label htmlFor="email">Email address</label>
            <div className="input-wrap">
              <svg
                className="input-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="14"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="m3.5 7 8.5 6 8.5-6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@amanor.org"
                autoComplete="username"
                required
                disabled={submitting}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-wrap input-wrap--action">
              <svg
                className="input-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="4.5"
                  y="10.5"
                  width="15"
                  height="10"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                autoComplete="current-password"
                minLength={14}
                required
                disabled={submitting}
              />
              <button
                type="button"
                className="input-icon-button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={submitting}
              >
                {showPassword ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="m3 3 18 18"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M10.6 10.6a3 3 0 0 0 4.05 4.2"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17.8 17.8 0 0 1-2.8 3.5M6.5 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 3.2-.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="3"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Checking credentials" : "Continue securely"}
          </button>
        </form>
      )}
    </AuthFrame>
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
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    <main
      className="admin-shell"
      data-nav-open={navOpen ? "true" : undefined}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : undefined}
    >
      <div className="admin-mobile-bar">
        <div className="admin-brand admin-brand--compact">
          <AmanorMark className="admin-brand__mark" />
          <p className="console-name">Administration</p>
        </div>
        <button
          type="button"
          className="admin-nav-toggle"
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
          aria-controls="admin-sidebar"
          onClick={() => setNavOpen((open) => !open)}
        >
          <span className="admin-nav-toggle__bars" aria-hidden="true" />
        </button>
      </div>
      {navOpen ? (
        <button
          type="button"
          className="admin-sidebar__scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <aside className="admin-sidebar" id="admin-sidebar">
        <div className="admin-brand">
          <AmanorMark className="admin-brand__mark" />
          <div className="admin-brand__copy">
            <p className="product-mark">Project AMANOR</p>
            <p className="console-name">Administration</p>
          </div>
        </div>
        <nav className="admin-navigation" aria-label="Administration sections">
          {allowedNavigation.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === active?.id ? "page" : undefined}
              onClick={() => {
                setActiveId(item.id);
                setNavOpen(false);
              }}
            >
              <span className="admin-navigation__index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="admin-navigation__copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="admin-stage" aria-labelledby="workspace-title">
        <header className="admin-navbar">
          <div className="admin-navbar__route">
            <button
              className="admin-sidebar-toggle"
              type="button"
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              aria-pressed={sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
            </button>
            <p>
              Administration <span aria-hidden="true">/</span>{" "}
              <strong>{active?.label ?? "Overview"}</strong>
            </p>
          </div>
          <div className="admin-navbar__actions">
            <span className="admin-navbar__identity">
              {roleLabels[user.roles[0] ?? "editor"]}
              {user.roles.length > 1 ? ` +${user.roles.length - 1}` : ""}
            </span>
            {user.roles.includes("principal") ? (
              <Link className="text-button" href="/room">
                The Room
              </Link>
            ) : null}
            <button
              className="admin-navbar__signout"
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "Signing out" : "Sign out"}
            </button>
          </div>
        </header>

        <div className="admin-content">
          <header className="workspace-header">
            <div>
              <p className="section-context">Protected workspace</p>
              <h1 id="workspace-title">{active?.label ?? "Overview"}</h1>
              <p>{active?.description}</p>
            </div>
            <span className="access-state">Authenticated</span>
          </header>

          {active?.id === "security" ? (
            <SecurityWorkspace currentUserId={user.id} />
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
                  <span>
                    Review and source validation apply before release.
                  </span>
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
        </div>
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
