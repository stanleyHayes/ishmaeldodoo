import type { ReactNode } from "react";
import { AmanorMark } from "../amanor-mark";

export function AuthFrame({
  title,
  description,
  eyebrow,
  children,
}: Readonly<{
  title: string;
  description: string;
  eyebrow: string;
  children: ReactNode;
}>) {
  return (
    <main className="auth-page">
      <div className="auth-page__grid" aria-hidden="true" />
      <section className="auth-shell" aria-labelledby="auth-title">
        <aside className="auth-story">
          <div className="auth-brand">
            <AmanorMark className="auth-brand__mark" />
            <span>
              <strong>Project AMANOR</strong>
              <small>Operator console</small>
            </span>
          </div>

          <div className="auth-story__copy">
            <p className="auth-eyebrow">{eyebrow}</p>
            <h1 id="auth-title">{title}</h1>
            <p>{description}</p>
          </div>

          <div className="auth-assurance" aria-label="Access safeguards">
            <p>
              <span>01</span>
              Issued accounts only
            </p>
            <p>
              <span>02</span>
              Multi-factor verification
            </p>
            <p>
              <span>03</span>
              Every access is recorded
            </p>
          </div>
        </aside>

        <div className="auth-workspace">
          <div className="auth-workspace__header">
            <p>Secure access</p>
            <span>
              <i aria-hidden="true" /> Encrypted session
            </span>
          </div>
          {children}
          <p className="auth-access-notice">
            Unauthorised use may be investigated. Credentials and verification
            codes are never retained in this browser.
          </p>
        </div>
      </section>
    </main>
  );
}
