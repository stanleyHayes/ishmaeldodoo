"use client";

import { useState } from "react";
import { AdministratorManager } from "./administrator-manager";
import { AuthenticationAudit } from "./authentication-audit";
import { SessionManager } from "./session-manager";
import { StepUpPanel } from "./step-up-panel";

export function SecurityWorkspace({
  currentUserId,
}: Readonly<{ currentUserId: string }>) {
  const [activePanel, setActivePanel] = useState<
    "sessions" | "verification" | "administrators" | "audit"
  >("sessions");
  const panels = [
    {
      id: "sessions" as const,
      number: "01",
      label: "Active sessions",
      description: "Review and revoke signed-in devices",
    },
    {
      id: "verification" as const,
      number: "02",
      label: "Verification",
      description: "MFA, recovery codes and security keys",
    },
    {
      id: "administrators" as const,
      number: "03",
      label: "Administrators",
      description: "Invite people and manage their access",
    },
    {
      id: "audit" as const,
      number: "04",
      label: "Audit evidence",
      description: "Check the protected activity record",
    },
  ];

  return (
    <div className="security-workspace">
      <section
        className="security-command"
        aria-labelledby="security-command-title"
      >
        <div className="security-command__copy">
          <p className="section-context">Identity control centre</p>
          <h2 id="security-command-title">Access and security</h2>
          <p>
            Choose one security task below. Only that workspace opens, keeping
            the page focused and easier to use.
          </p>
        </div>
        <dl className="security-command__assurance">
          <div>
            <dt>Access tokens</dt>
            <dd>Short-lived</dd>
          </div>
          <div>
            <dt>High-risk changes</dt>
            <dd>Fresh MFA</dd>
          </div>
          <div>
            <dt>Audit evidence</dt>
            <dd>Integrity-chained</dd>
          </div>
        </dl>
      </section>

      <nav className="security-index" aria-label="Security workspace sections">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            aria-current={activePanel === panel.id ? "page" : undefined}
            onClick={() => setActivePanel(panel.id)}
          >
            <span>{panel.number}</span>
            <strong>{panel.label}</strong>
            <small>{panel.description}</small>
          </button>
        ))}
      </nav>

      <div className="security-workspace__flow" aria-live="polite">
        {activePanel === "sessions" ? <SessionManager /> : null}
        {activePanel === "verification" ? <StepUpPanel /> : null}
        {activePanel === "administrators" ? (
          <AdministratorManager currentUserId={currentUserId} />
        ) : null}
        {activePanel === "audit" ? <AuthenticationAudit /> : null}
      </div>
    </div>
  );
}
