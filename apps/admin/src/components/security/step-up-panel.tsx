"use client";

import { useEffect, useState } from "react";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type { HardwareKeySummary } from "@amanor/contracts";
import {
  authenticateHardwareKey,
  createHardwareKeyAuthenticationOptions,
  createHardwareKeyRegistrationOptions,
  listHardwareKeys,
  registerHardwareKey,
  revokeHardwareKey,
  rotateRecoveryCodes,
  stepUp,
} from "../../lib/api/client";
import { SegmentedCodeInput } from "./segmented-code-input";

export function StepUpPanel() {
  const [state, setState] = useState<"idle" | "working" | "ready" | "error">(
    "idle",
  );
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[]>([]);
  const [hardwareKeys, setHardwareKeys] = useState<
    readonly HardwareKeySummary[]
  >([]);
  const [hardwareMessage, setHardwareMessage] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    void listHardwareKeys()
      .then(setHardwareKeys)
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("working");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await stepUp(String(data.get("mfaCode") ?? ""));
      form.reset();
      setState("ready");
    } catch {
      setState("error");
    }
  }

  async function replaceCodes() {
    setState("working");
    try {
      const result = await rotateRecoveryCodes();
      setRecoveryCodes(result.recoveryCodes);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  async function enrolHardwareKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("working");
    setHardwareMessage("");
    const form = event.currentTarget;
    const label = String(
      new FormData(form).get("hardwareKeyLabel") ?? "",
    ).trim();
    try {
      const ceremony = await createHardwareKeyRegistrationOptions();
      const response = await startRegistration({
        optionsJSON:
          ceremony.options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      await registerHardwareKey({
        ceremonyId: ceremony.ceremonyId,
        response,
        label,
      });
      setHardwareKeys(await listHardwareKeys());
      form.reset();
      setHardwareMessage("Hardware key enrolled.");
      setState("ready");
    } catch {
      setHardwareMessage("Hardware-key enrollment failed or was cancelled.");
      setState("error");
    }
  }

  async function verifyHardwareKey() {
    setState("working");
    setHardwareMessage("");
    try {
      const ceremony = await createHardwareKeyAuthenticationOptions();
      const response = await startAuthentication({
        optionsJSON:
          ceremony.options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
      await authenticateHardwareKey({
        ceremonyId: ceremony.ceremonyId,
        response,
      });
      setHardwareMessage(
        "Hardware key verified. Room access is elevated for five minutes.",
      );
      setState("ready");
    } catch {
      setHardwareMessage("Hardware-key verification failed or was cancelled.");
      setState("error");
    }
  }

  async function removeHardwareKey(credentialId: string) {
    setState("working");
    try {
      await revokeHardwareKey(credentialId);
      setHardwareKeys(await listHardwareKeys());
      setHardwareMessage("Hardware key revoked.");
      setState("ready");
    } catch {
      setHardwareMessage(
        "Hardware-key revocation requires a fresh TOTP verification.",
      );
      setState("error");
    }
  }

  return (
    <section className="session-panel" aria-labelledby="step-up-title">
      <div className="session-heading">
        <div>
          <p className="section-context">Recent verification</p>
          <h2 id="step-up-title">Confirm high-risk changes</h2>
          <p>
            Verify with a fresh authenticator code before inviting, disabling,
            re-enabling, or changing administrator roles. Elevation expires in
            five minutes and is removed on refresh.
          </p>
        </div>
      </div>
      <form className="administrator-invitation" onSubmit={submit}>
        <div className="field field--code">
          <span className="field-label" id="step-up-code-label">
            Current authenticator code
          </span>
          <SegmentedCodeInput
            name="mfaCode"
            labelId="step-up-code-label"
            groups={[6]}
            disabled={state === "working"}
            onValueChange={setCode}
          />
        </div>
        <button
          type="submit"
          disabled={state === "working" || code.length !== 6}
        >
          {state === "working" ? "Verifying" : "Verify recent MFA"}
        </button>
      </form>
      {state === "ready" ? (
        <div role="status">
          <p>High-risk actions are enabled for five minutes.</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void replaceCodes()}
          >
            Replace recovery codes
          </button>
          {recoveryCodes.length > 0 ? (
            <div>
              <p>
                Store these codes securely now. Every previous recovery code is
                invalid and these values will not be shown again.
              </p>
              <ul aria-label="Replacement recovery codes">
                {recoveryCodes.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="session-heading">
        <div>
          <p className="section-context">Hardware-backed verification</p>
          <h3>Security keys</h3>
          <p>
            Use a locally connected security key. No key secret or biometric
            leaves the authenticator.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={state === "working" || hardwareKeys.length === 0}
          onClick={() => void verifyHardwareKey()}
        >
          Verify hardware key
        </button>
      </div>
      {state === "ready" ? (
        <form className="administrator-invitation" onSubmit={enrolHardwareKey}>
          <div className="field">
            <label htmlFor="hardware-key-label">Security-key label</label>
            <input
              id="hardware-key-label"
              name="hardwareKeyLabel"
              minLength={1}
              maxLength={80}
              autoComplete="off"
              required
            />
          </div>
          <button type="submit">Enrol local security key</button>
        </form>
      ) : null}
      {hardwareKeys.length > 0 ? (
        <ul aria-label="Enrolled hardware keys">
          {hardwareKeys.map((key) => (
            <li key={key.credentialId}>
              <span>{key.label}</span>{" "}
              <small>
                {key.deviceType === "singleDevice"
                  ? "single-device"
                  : "multi-device"}
                {key.backedUp ? " · backed up" : ""}
              </small>{" "}
              <button
                type="button"
                className="secondary-button"
                disabled={state === "working"}
                onClick={() => void removeHardwareKey(key.credentialId)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hardwareMessage ? <p role="status">{hardwareMessage}</p> : null}
      {state === "error" ? (
        <p className="form-error" role="alert">
          Verification failed. Use a fresh authenticator code.
        </p>
      ) : null}
    </section>
  );
}
