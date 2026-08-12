"use client";

import type { InvitationSetupResponse } from "@amanor/contracts";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { acceptInvitation, getInvitationSetup } from "../../lib/api/client";
import { AdminWorkspace } from "../admin-workspace";
import { SegmentedCodeInput } from "./segmented-code-input";

export function InvitationGateway() {
  const token = useSearchParams()?.get("invitation");
  return token ? <InvitationAcceptance token={token} /> : <AdminWorkspace />;
}

export function InvitationAcceptance({ token }: Readonly<{ token: string }>) {
  const [setup, setSetup] = useState<InvitationSetupResponse | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "complete"
  >("loading");
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[]>([]);
  const [code, setCode] = useState("");

  useEffect(() => {
    void getInvitationSetup(token).then(
      (result) => {
        setSetup(result);
        setState("ready");
      },
      () => setState("error"),
    );
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await acceptInvitation({
        token,
        password: String(data.get("password") ?? ""),
        mfaCode: String(data.get("mfaCode") ?? ""),
      });
      setRecoveryCodes(result.recoveryCodes);
      setState("complete");
    } catch {
      setState("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="invitation-title">
        <div className="login-introduction">
          <p className="product-mark">Project AMANOR</p>
          <h1 id="invitation-title">Secure account setup</h1>
          <p>
            Set a unique password and enroll an authenticator before this
            one-time invitation expires.
          </p>
        </div>
        {state === "loading" ? (
          <p role="status">Validating invitation…</p>
        ) : null}
        {state === "error" ? (
          <p className="form-error" role="alert">
            This invitation is invalid, expired, or could not be completed.
          </p>
        ) : null}
        {state === "complete" ? (
          <div role="status">
            <p>
              Account setup is complete. Save these single-use recovery codes
              now; they will not be shown again.
            </p>
            <ul aria-label="Recovery codes">
              {recoveryCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <Link className="primary-button" href="/">
              I have stored the codes securely
            </Link>
          </div>
        ) : null}
        {state === "ready" && setup ? (
          <form className="login-form" onSubmit={submit} aria-busy={submitting}>
            <p>
              <strong>{setup.email}</strong>
            </p>
            <div className="field">
              <label htmlFor="enrollment-uri">Authenticator setup URI</label>
              <textarea
                id="enrollment-uri"
                readOnly
                rows={4}
                value={setup.enrollmentUri}
              />
              <p className="field-help">
                Import this URI into your authenticator. Never share it.
              </p>
            </div>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={14}
                maxLength={128}
                required
              />
            </div>
            <div className="field field--code">
              <span className="field-label" id="setup-code-label">
                Current authenticator code
              </span>
              <SegmentedCodeInput
                name="mfaCode"
                labelId="setup-code-label"
                groups={[6]}
                disabled={submitting}
                onValueChange={setCode}
              />
            </div>
            <button
              className="primary-button"
              type="submit"
              disabled={submitting || code.length !== 6}
            >
              {submitting ? "Completing setup" : "Complete secure setup"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
