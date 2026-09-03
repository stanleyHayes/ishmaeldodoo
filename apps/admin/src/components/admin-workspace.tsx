"use client";

import type { AuthSessionResponse } from "@amanor/contracts";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ApiClientError,
  beginLogin,
  completeLogin,
  hasResumableSession,
  logout,
  resumeSession,
} from "../lib/api/client";
import { SecurityWorkspace } from "./security/security-workspace";
import { ContentWorkspace } from "./content/content-workspace";
import { ProtocolDeskWorkspace } from "./protocol/protocol-desk-workspace";
import { AmanorMark } from "./amanor-mark";
import { MediaWorkspace } from "./media/media-workspace";
import { SegmentedCodeInput } from "./security/segmented-code-input";
import { AuthFrame } from "./security/auth-frame";
import { WorkspaceHelp, type WorkspaceHelpGuide } from "./ui/workspace-help";
import { AdminEmptyState, AdminSkeleton } from "./ui/admin-state";

const MFA_CODE_LENGTH = 6;
const RECOVERY_CODE_LENGTH = 19;
const ONBOARDING_STORAGE_KEY = "amanor-admin-onboarding-v1";

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
    symbol: "⌂",
    label: "Home",
    description: "See what needs your attention",
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
    symbol: "✎",
    label: "Website Content",
    description: "Write, translate, review and publish pages",
    roles: ["principal", "editor", "translator", "reviewer"],
  },
  {
    id: "media",
    symbol: "▧",
    label: "Images and Media",
    description: "Manage approved images, audio and video",
    roles: ["principal", "editor", "press_officer"],
  },
  {
    id: "protocol",
    symbol: "◇",
    label: "Requests and events",
    description: "Review speaking requests and event messages",
    roles: ["principal", "desk_officer"],
  },
  {
    id: "legacy",
    symbol: "♧",
    label: "Scholar support",
    description: "Manage scholar consent and support records",
    roles: ["principal", "trust_admin"],
  },
  {
    id: "security",
    symbol: "⌾",
    label: "Access and Security",
    description: "Manage accounts, sessions and security history",
    roles: ["principal", "security_admin"],
  },
] as const satisfies readonly {
  id: string;
  symbol: string;
  label: string;
  description: string;
  roles: readonly AdminRole[];
}[];

const workspaceHelp = {
  overview: {
    title: "Overview",
    summary: "Start here to understand what is ready and what needs attention.",
    steps: [
      "Review the status cards for publishing, translation parity and access controls.",
      "Check the work queue for the next assignment available to your role.",
      "Open the relevant section from the navigation to complete that assignment.",
      "Return here to confirm the workspace status after your action.",
    ],
  },
  content: {
    title: "Content",
    summary:
      "Create, translate, review and release source-backed public content.",
    steps: [
      "Choose the document or page you want to work on, or create a new draft.",
      "Complete the English and French fields and attach a source to every public claim.",
      "Save the draft, then submit it into the editorial review workflow.",
      "Use the audit and parity checks to resolve missing sources or stale translations.",
      "Publish only after the required second-person approval is recorded.",
    ],
  },
  media: {
    title: "Media",
    summary: "Manage approved portraits, field media and transcript records.",
    steps: [
      "Choose the media collection that matches the asset you are managing.",
      "Add the file details, caption, credit, consent and source information.",
      "Review its language, accessibility text and publication status.",
      "Release only assets with the required rights and approval; otherwise keep them governed.",
    ],
  },
  protocol: {
    title: "Protocol Desk",
    summary: "Triage engagement requests and record each governed decision.",
    steps: [
      "Review operational health, then filter the queue to the requests needing attention.",
      "Open a request and verify the requester, event details, flags and availability.",
      "Assign an owner and add an internal note when more context is required.",
      "Move the request through only the available next state and record the reason.",
      "For accepted work, verify correspondence and calendar delivery, then download the Protocol Note.",
    ],
  },
  legacy: {
    title: "Legacy",
    summary:
      "Review scholar consent and giving records without exposing private data.",
    steps: [
      "Review the status cards to identify consent or stewardship work requiring attention.",
      "Open the relevant record from the work queue available to your role.",
      "Confirm the consent basis and permitted public fields before making a change.",
      "Record the outcome and return to the overview to confirm the updated status.",
    ],
  },
  security: {
    title: "Security",
    summary:
      "Manage administrators, sessions and authentication audit evidence.",
    steps: [
      "Review the security summary and integrity status before taking action.",
      "Use administrator access to invite or review an operator and assign only the required roles.",
      "Use active sessions to revoke access that is no longer trusted or required.",
      "Inspect the authentication audit for the event, actor and time you need to verify.",
      "Confirm the integrity check remains valid after completing the review.",
    ],
  },
} as const satisfies Record<
  (typeof navigation)[number]["id"],
  WorkspaceHelpGuide
>;

/**
 * Every section is addressable. The shell drives the URL with `history` rather
 * than the app router, because it is one client tree that owns its own section
 * state; the route files under `app/` exist so a reload or a pasted link lands
 * on the same place.
 */
const sectionPaths: Readonly<Record<string, string>> = {
  overview: "/",
  content: "/content",
  media: "/media",
  protocol: "/protocol",
  legacy: "/legacy",
  security: "/security",
};

function sectionFromPath(pathname: string): string | null {
  const match = Object.entries(sectionPaths).find(
    ([, path]) => path !== "/" && pathname.startsWith(path),
  );
  if (match) return match[0];
  return pathname === "/" ? "overview" : null;
}

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
  const fallbackId = allowedNavigation[0]?.id ?? "overview";
  const [activeId, setActiveId] = useState(() => {
    const fromPath =
      typeof window === "undefined"
        ? null
        : sectionFromPath(window.location.pathname);
    return fromPath && allowedNavigation.some((item) => item.id === fromPath)
      ? fromPath
      : fallbackId;
  });
  const [signingOut, setSigningOut] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const active =
    allowedNavigation.find((item) => item.id === activeId) ??
    allowedNavigation[0];
  const accountLabel = "Signed-in operator";

  useEffect(() => {
    function syncFromHistory() {
      const fromPath = sectionFromPath(window.location.pathname);
      if (fromPath && allowedNavigation.some((item) => item.id === fromPath))
        setActiveId(fromPath);
    }
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [allowedNavigation]);

  function openSection(id: string) {
    setActiveId(id);
    setNavOpen(false);
    const path = sectionPaths[id];
    if (path && window.location.pathname !== path)
      window.history.pushState(null, "", path);
  }

  useEffect(() => {
    if (
      window.localStorage?.getItem(ONBOARDING_STORAGE_KEY) !== "complete" &&
      process.env.NODE_ENV !== "test"
    ) {
      const timer = window.setTimeout(() => setOnboardingStep(0), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [accountOpen]);

  function finishOnboarding() {
    window.localStorage?.setItem(ONBOARDING_STORAGE_KEY, "complete");
    setOnboardingStep(null);
  }

  const onboarding = [
    {
      title: "Welcome to your workspace",
      copy: "This is the private control room for the public website. Only the tools allowed for your account are shown.",
    },
    {
      title: "Choose work from the sidebar",
      copy: "Website Content handles pages and translations. Images and Media stores approved assets. Requests and events manages incoming engagements.",
    },
    {
      title: "Use the account menu",
      copy: "The menu at the top right shows your access, opens help, restarts this guide and signs you out securely.",
    },
  ] as const;

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
          {allowedNavigation.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === active?.id ? "page" : undefined}
              onClick={() => openSection(item.id)}
            >
              <span className="admin-navigation__index" aria-hidden="true">
                {item.symbol}
              </span>
              <span className="admin-navigation__copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <span className="admin-sidebar__status" aria-hidden="true" />
          <div className="admin-navigation__copy">
            <strong>Secure workspace</strong>
            <small>Protected operator access</small>
          </div>
        </div>
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
              <span className="admin-navbar__greeting">Welcome back</span>
              <strong>{active?.label ?? "Overview"}</strong>
            </p>
          </div>
          <div className="admin-navbar__actions">
            {user.roles.includes("principal") ? (
              <Link className="text-button" href="/room">
                The Room
              </Link>
            ) : null}
            <div className="admin-account" ref={accountMenuRef}>
              <button
                className="admin-account__trigger"
                type="button"
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((open) => !open)}
              >
                <span className="admin-account__avatar" aria-hidden="true">
                  {accountLabel.slice(0, 1).toUpperCase()}
                </span>
                <span className="admin-account__copy">
                  <strong>{accountLabel}</strong>
                  <small>
                    {roleLabels[user.roles[0] ?? "editor"]}
                    {user.roles.length > 1 ? ` +${user.roles.length - 1}` : ""}
                  </small>
                </span>
                <span className="admin-account__chevron" aria-hidden="true">
                  ⌄
                </span>
              </button>
              {accountOpen ? (
                <div className="admin-account__menu" role="menu">
                  <div className="admin-account__summary">
                    <strong>{accountLabel}</strong>
                    <span>
                      {user.roles.length} assigned{" "}
                      {user.roles.length === 1 ? "role" : "roles"}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      setOnboardingStep(0);
                    }}
                  >
                    <span aria-hidden="true">?</span>
                    <span>
                      <strong>Guided tour</strong>
                      <small>Learn how this workspace works</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      openSection("security");
                      window.setTimeout(() => {
                        document.getElementById("workspace-title")?.focus();
                      }, 0);
                    }}
                  >
                    <span aria-hidden="true">⌾</span>
                    <span>
                      <strong>Access and security</strong>
                      <small>Review sessions and account access</small>
                    </span>
                  </button>
                  <button
                    className="admin-account__signout"
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    disabled={signingOut}
                  >
                    <span aria-hidden="true">↗</span>
                    <span>
                      <strong>{signingOut ? "Signing out" : "Sign out"}</strong>
                      <small>End this secure session</small>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              className="admin-navbar__signout admin-navbar__signout--icon"
              type="button"
              aria-label="Sign out"
              title="Sign out"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>

        <div className="admin-content" data-workspace={active?.id}>
          <header className="workspace-header">
            <div>
              <p className="section-context">Your workspace</p>
              <h1 id="workspace-title" tabIndex={-1}>
                {active?.label ?? "Overview"}
              </h1>
              <p>{active?.description}</p>
            </div>
            <div className="workspace-header__actions">
              <WorkspaceHelp
                key={active?.id}
                guide={workspaceHelp[active?.id ?? "overview"]}
              />
              <span className="access-state">Signed in</span>
            </div>
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
              <section
                className="admin-quick-start"
                aria-labelledby="quick-start-title"
              >
                <div className="admin-quick-start__heading">
                  <div>
                    <p className="section-context">Start here</p>
                    <h2 id="quick-start-title">What would you like to do?</h2>
                  </div>
                  <p>
                    Choose a task below. You will only see areas available to
                    your account.
                  </p>
                </div>
                <div className="admin-quick-start__grid">
                  {allowedNavigation
                    .filter((item) => item.id !== "overview")
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={`Go to ${item.id} tools`}
                        onClick={() => openSection(item.id)}
                      >
                        <span>{item.label}</span>
                        <small>{item.description}</small>
                        <b aria-hidden="true">→</b>
                      </button>
                    ))}
                </div>
              </section>

              <section
                className="admin-rules"
                aria-labelledby="admin-rules-title"
              >
                <div className="admin-rules__heading">
                  <p className="section-context">Keep in mind</p>
                  <h2 id="admin-rules-title">
                    Three rules that protect every update
                  </h2>
                </div>
                <div className="status-grid" aria-label="Workspace rules">
                  <article>
                    <p>
                      <span aria-hidden="true">01</span> Before a page goes live
                    </p>
                    <strong>Review and sources are required</strong>
                    <span>
                      Every public claim must have a source and another
                      authorised person must approve publication.
                    </span>
                  </article>
                  <article>
                    <p>
                      <span aria-hidden="true">02</span> English and French
                    </p>
                    <strong>Both versions stay together</strong>
                    <span>
                      The workspace clearly marks missing or outdated French
                      text before publication.
                    </span>
                  </article>
                  <article>
                    <p>
                      <span aria-hidden="true">03</span> Your access
                    </p>
                    <strong>
                      {user.roles.length} assigned{" "}
                      {user.roles.length === 1 ? "role" : "roles"}
                    </strong>
                    <span>
                      Only the tools your role is allowed to use appear in the
                      menu.
                    </span>
                  </article>
                </div>
              </section>

              <section className="work-queue" aria-label="Your work queue">
                <AdminEmptyState
                  kind="work"
                  title="You're all caught up"
                  description="Drafts, reviews and engagement requests assigned to you will appear here with the next action to take."
                />
              </section>
            </>
          )}
        </div>
      </section>
      {onboardingStep !== null ? (
        <div
          className="admin-onboarding"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-onboarding-title"
        >
          <button
            className="admin-onboarding__backdrop"
            type="button"
            aria-label="Close guided tour"
            onClick={finishOnboarding}
          />
          <section className="admin-onboarding__card">
            <div className="admin-onboarding__progress">
              <span>Getting started</span>
              <span>
                Step {onboardingStep + 1} of {onboarding.length}
              </span>
            </div>
            <div className="admin-onboarding__illustration" aria-hidden="true">
              <AmanorMark />
            </div>
            <h2 id="admin-onboarding-title">
              {onboarding[onboardingStep]?.title}
            </h2>
            <p>{onboarding[onboardingStep]?.copy}</p>
            <div className="admin-onboarding__dots" aria-hidden="true">
              {onboarding.map((step, index) => (
                <span
                  key={step.title}
                  data-current={index === onboardingStep ? "true" : undefined}
                />
              ))}
            </div>
            <div className="admin-onboarding__actions">
              <button
                type="button"
                className="text-button"
                onClick={finishOnboarding}
              >
                Skip tour
              </button>
              <div>
                {onboardingStep > 0 ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setOnboardingStep(onboardingStep - 1)}
                  >
                    Back
                  </button>
                ) : null}
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    onboardingStep === onboarding.length - 1
                      ? finishOnboarding()
                      : setOnboardingStep(onboardingStep + 1)
                  }
                >
                  {onboardingStep === onboarding.length - 1
                    ? "Start working"
                    : "Next"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export function AdminWorkspace() {
  const [user, setUser] = useState<AdminUser | null>(null);
  // Only wait when there is something to wait for: an operator returning to a
  // live session should not be asked to sign in again, and a first-time visitor
  // should not be shown a placeholder for a session that never existed.
  const [resuming, setResuming] = useState(() =>
    typeof window === "undefined" ? false : hasResumableSession(),
  );

  useEffect(() => {
    if (!resuming) return;
    let current = true;
    void resumeSession()
      .then((session) => {
        if (current && session) setUser(session.user);
      })
      .finally(() => {
        if (current) setResuming(false);
      });
    return () => {
      current = false;
    };
    // Runs once: `resuming` only ever goes from true to false.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (resuming)
    return (
      <main className="login-page" aria-busy="true">
        <AdminSkeleton variant="panel" label="Restoring your session" />
      </main>
    );
  return user ? (
    <OperatorShell user={user} onSignedOut={() => setUser(null)} />
  ) : (
    <LoginForm onAuthenticated={setUser} />
  );
}
