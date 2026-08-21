"use client";

import { AdministratorManager } from "./administrator-manager";
import { AuthenticationAudit } from "./authentication-audit";
import { SessionManager } from "./session-manager";
import { StepUpPanel } from "./step-up-panel";

export function SecurityWorkspace({
  currentUserId,
}: Readonly<{ currentUserId: string }>) {
  return (
    <div className="security-workspace">
      <section
        className="security-command"
        aria-labelledby="security-command-title"
      >
        <div className="security-command__copy">
          <p className="section-context">Identity control centre</p>
          <h2 id="security-command-title">
            Protect access. Preserve evidence.
          </h2>
          <p>
            Review live sessions, verify high-risk actions, govern operator
            access and inspect the integrity-chained record from one place.
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

      <div className="security-workspace__flow">
        <SessionManager />
        <StepUpPanel />
        <AdministratorManager currentUserId={currentUserId} />
        <AuthenticationAudit />
      </div>
    </div>
  );
}
