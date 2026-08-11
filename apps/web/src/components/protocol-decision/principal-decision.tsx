"use client";

import {
  principalDecisionActions,
  principalDecisionInputSchema,
  principalDecisionResponseSchema,
  type PrincipalDecisionResponse,
} from "@amanor/contracts";
import { useEffect, useState } from "react";
import styles from "./principal-decision.module.css";

type Locale = "en-GB" | "fr-FR";
type Action = (typeof principalDecisionActions)[number];

const copy = {
  "en-GB": {
    eyebrow: "Project AMANOR · Protocol Desk",
    title: "Confirm your decision",
    intro:
      "Review the action below. Nothing is recorded until you press the confirmation button.",
    reason: "Decision note",
    reasonHint: "State the reason or information needed.",
    declineCategory: "Decline category",
    categories: { capacity: "Capacity", fit: "Fit", conflict: "Conflict" },
    confirm: "Confirm decision",
    working: "Recording decision…",
    invalid:
      "This decision link is incomplete. Open the original link from the Protocol Desk email.",
    failed:
      "This link is invalid, expired, or already used. Contact the Protocol Desk for a new link.",
    complete: "Decision recorded",
    reference: "Request reference",
    privacy:
      "This one-time link has been removed from the address bar and is not stored by this page.",
    actions: {
      accept: "Accept",
      decline: "Decline",
      hold: "Place on hold",
      request_information: "Request information",
    },
  },
  "fr-FR": {
    eyebrow: "Projet AMANOR · Bureau du protocole",
    title: "Confirmer votre décision",
    intro:
      "Vérifiez l’action ci-dessous. Rien n’est enregistré avant votre confirmation.",
    reason: "Note de décision",
    reasonHint: "Indiquez le motif ou les informations nécessaires.",
    declineCategory: "Motif du refus",
    categories: {
      capacity: "Capacité",
      fit: "Adéquation",
      conflict: "Conflit",
    },
    confirm: "Confirmer la décision",
    working: "Enregistrement de la décision…",
    invalid:
      "Ce lien de décision est incomplet. Ouvrez le lien d’origine envoyé par le Bureau du protocole.",
    failed:
      "Ce lien est invalide, expiré ou déjà utilisé. Contactez le Bureau du protocole pour obtenir un nouveau lien.",
    complete: "Décision enregistrée",
    reference: "Référence de la demande",
    privacy:
      "Ce lien à usage unique a été retiré de la barre d’adresse et n’est pas conservé par cette page.",
    actions: {
      accept: "Accepter",
      decline: "Refuser",
      hold: "Mettre en attente",
      request_information: "Demander des informations",
    },
  },
} as const;

export function PrincipalDecision({ locale }: Readonly<{ locale: Locale }>) {
  const text = copy[locale];
  const [capability, setCapability] = useState<
    Readonly<{ token: string; action: Action }> | undefined
  >();
  const [loaded, setLoaded] = useState(false);
  const [reason, setReason] = useState("");
  const [declineCategory, setDeclineCategory] = useState<
    "capacity" | "fit" | "conflict"
  >("capacity");
  const [status, setStatus] = useState<"ready" | "working" | "failed">("ready");
  const [result, setResult] = useState<PrincipalDecisionResponse>();

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const token = parameters.get("token") ?? "";
    const candidate = parameters.get("action") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (
        token.length >= 40 &&
        principalDecisionActions.includes(candidate as Action)
      )
        setCapability({ token, action: candidate as Action });
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capability || status === "working") return;
    const parsed = principalDecisionInputSchema.safeParse({
      ...capability,
      reason,
      ...(capability.action === "decline" ? { declineCategory } : {}),
    });
    if (!parsed.success) return;
    setStatus("working");
    try {
      const response = await fetch("/api/protocol-desk/principal-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        cache: "no-store",
      });
      const payload = await response.json();
      const accepted = principalDecisionResponseSchema.safeParse(payload);
      if (!response.ok || !accepted.success) throw new Error();
      setResult(accepted.data);
      setCapability(undefined);
      setReason("");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <main className={styles.shell} id="main-content" tabIndex={-1}>
      <section className={styles.panel} aria-labelledby="decision-title">
        <p className={styles.eyebrow}>{text.eyebrow}</p>
        <h1 id="decision-title">{result ? text.complete : text.title}</h1>
        {result ? (
          <div className={styles.result} role="status">
            <p>{text.actions[actionForState(result.state)]}</p>
            <p>
              {text.reference}: <strong>{result.reference}</strong>
            </p>
          </div>
        ) : capability ? (
          <form onSubmit={submit} className={styles.form}>
            <p>{text.intro}</p>
            <div className={styles.action} aria-label={text.title}>
              {text.actions[capability.action]}
            </div>
            <label>
              <span>{text.reason}</span>
              <textarea
                required
                minLength={1}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={text.reasonHint}
              />
            </label>
            {capability.action === "decline" ? (
              <label>
                <span>{text.declineCategory}</span>
                <select
                  value={declineCategory}
                  onChange={(event) =>
                    setDeclineCategory(
                      event.target.value as typeof declineCategory,
                    )
                  }
                >
                  {Object.entries(text.categories).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {status === "failed" ? (
              <p className={styles.error} role="alert">
                {text.failed}
              </p>
            ) : null}
            <button disabled={!reason.trim() || status === "working"}>
              {status === "working" ? text.working : text.confirm}
            </button>
          </form>
        ) : loaded ? (
          <p className={styles.error} role="alert">
            {text.invalid}
          </p>
        ) : null}
        <p className={styles.privacy}>{text.privacy}</p>
      </section>
    </main>
  );
}

function actionForState(state: PrincipalDecisionResponse["state"]): Action {
  if (state === "accepted") return "accept";
  if (state === "declined") return "decline";
  if (state === "held") return "hold";
  return "request_information";
}
