"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { roomPlaintextSchema, type RoomRecipientKey } from "@amanor/contracts";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import { loadRoomRecipientKey, submitRoomEnquiry } from "../../lib/room/client";

/**
 * The Room's public surface.
 *
 * Two rules shape this component. First, no field that could hold sensitive
 * text is rendered until a verified recipient key is in hand, so a submitter can
 * never type into a form that would have to fail. Second, the procurement
 * prohibition is stated before the form, not beneath it — Section 12.2 of the
 * brief makes that sentence non-negotiable, and a warning placed after the
 * inputs is a warning that arrives too late.
 */

type Status =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; recipient: RoomRecipientKey }
  | { kind: "sending"; recipient: RoomRecipientKey }
  | { kind: "sent"; reference: string; deleteAfter: string }
  | { kind: "failed"; recipient: RoomRecipientKey };

const copy = {
  "en-GB": {
    title: "The Room",
    lede: "A confidential channel for institutional and investment conversations that should not pass through a general contact form.",
    prohibitionTitle: "What this channel is not for",
    prohibition:
      "This is not a channel for procurement, tender or contract discussions relating to the 24-Hour Economy Authority. Messages of that kind cannot be considered here and must go through the Authority's own official processes.",
    howTitle: "How this works",
    how: [
      "Your message is encrypted in this browser before it is sent.",
      "The server stores only the encrypted text and cannot read it.",
      "It can be read only by the Principal, or by one person he has designated, using a hardware security key.",
      "It is deleted after 180 days unless an extension is explicitly recorded.",
    ],
    noAttachments:
      "Attachments are not accepted in this channel. Please describe what you need to convey in the message itself.",
    checking: "Verifying the recipient key…",
    unavailableTitle: "The confidential channel is closed",
    unavailable:
      "The recipient key could not be verified, so nothing can be sent securely right now. Please do not send confidential details by another route.",
    useContact: "Use the general contact page",
    name: "Your name",
    email: "Your email address",
    organisation: "Organisation (optional)",
    subject: "Subject",
    message: "Message",
    acknowledge:
      "I confirm this message does not concern procurement, tender or contract matters relating to the 24-Hour Economy Authority.",
    send: "Encrypt and send",
    sending: "Encrypting…",
    sentTitle: "Received",
    sentBody:
      "Keep this reference. There is no way to look a submission up online, and the reference is the only way to refer to it.",
    deleteAfter: "Scheduled for deletion after",
    failed:
      "The message could not be sent. Nothing was transmitted or stored. You may try again.",
    invalid: "Please complete every required field before sending.",
  },
  "fr-FR": {
    title: "La Chambre",
    lede: "Un canal confidentiel pour les conversations institutionnelles et d’investissement qui ne doivent pas passer par un formulaire de contact général.",
    prohibitionTitle: "Ce à quoi ce canal ne sert pas",
    prohibition:
      "Ce canal n’est pas destiné aux discussions de marchés publics, d’appels d’offres ou de contrats relatives à l’Autorité de l’Économie 24 Heures. De tels messages ne peuvent pas être examinés ici et doivent suivre les procédures officielles de l’Autorité.",
    howTitle: "Comment cela fonctionne",
    how: [
      "Votre message est chiffré dans ce navigateur avant d’être envoyé.",
      "Le serveur ne conserve que le texte chiffré et ne peut pas le lire.",
      "Seul le Principal, ou une personne qu’il a désignée, peut le lire au moyen d’une clé de sécurité matérielle.",
      "Il est supprimé après 180 jours, sauf prolongation explicitement enregistrée.",
    ],
    noAttachments:
      "Les pièces jointes ne sont pas acceptées dans ce canal. Veuillez décrire ce que vous souhaitez transmettre dans le message lui-même.",
    checking: "Vérification de la clé du destinataire…",
    unavailableTitle: "Le canal confidentiel est fermé",
    unavailable:
      "La clé du destinataire n’a pas pu être vérifiée\u00a0: rien ne peut être envoyé de manière sécurisée pour le moment. N’envoyez pas d’informations confidentielles par une autre voie.",
    useContact: "Utiliser la page de contact générale",
    name: "Votre nom",
    email: "Votre adresse électronique",
    organisation: "Organisation (facultatif)",
    subject: "Objet",
    message: "Message",
    acknowledge:
      "Je confirme que ce message ne concerne pas des questions de marchés publics, d’appels d’offres ou de contrats relatives à l’Autorité de l’Économie 24 Heures.",
    send: "Chiffrer et envoyer",
    sending: "Chiffrement…",
    sentTitle: "Reçu",
    sentBody:
      "Conservez cette référence. Aucune consultation en ligne n’est possible\u00a0; la référence est le seul moyen d’y faire allusion.",
    deleteAfter: "Suppression prévue après le",
    failed:
      "Le message n’a pas pu être envoyé. Rien n’a été transmis ni conservé. Vous pouvez réessayer.",
    invalid: "Veuillez compléter tous les champs requis avant l’envoi.",
  },
} as const;

export function RoomChannel({ locale }: Readonly<{ locale: SupportedLocale }>) {
  const text = copy[locale];
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadRoomRecipientKey()
      .then((recipient) => {
        if (!cancelled) setStatus({ kind: "ready", recipient });
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind !== "ready" && status.kind !== "failed") return;
    const recipient = status.recipient;
    const form = new FormData(event.currentTarget);

    const plaintext = roomPlaintextSchema.safeParse({
      fromName: form.get("fromName"),
      fromEmail: form.get("fromEmail"),
      organisation: form.get("organisation") || undefined,
      subject: form.get("subject"),
      message: form.get("message"),
    });
    if (!plaintext.success) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    setStatus({ kind: "sending", recipient });
    try {
      const receipt = await submitRoomEnquiry({
        plaintext: plaintext.data,
        recipient,
        locale,
      });
      setStatus({
        kind: "sent",
        reference: receipt.reference,
        deleteAfter: receipt.deleteAfter,
      });
    } catch {
      setStatus({ kind: "failed", recipient });
    }
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="room"
      aria-labelledby="room-title"
    >
      <header className="room__hero">
        <div>
          <p>
            {locale === "fr-FR" ? "Canal confidentiel" : "Confidential channel"}
          </p>
          <h1 id="room-title">{text.title}</h1>
        </div>
        <div>
          <p className="room__lede">{text.lede}</p>
          <p className="room__assurance">
            <span aria-hidden="true">●</span>
            {locale === "fr-FR"
              ? "Chiffrement dans votre navigateur"
              : "Encrypted in your browser"}
          </p>
        </div>
      </header>

      <div className="room__prohibition" role="note">
        <span aria-hidden="true">!</span>
        <div>
          <h2>{text.prohibitionTitle}</h2>
          <p>{text.prohibition}</p>
        </div>
      </div>

      <section className="room__process" aria-labelledby="room-process-title">
        <header>
          <p>01</p>
          <h2 id="room-process-title">{text.howTitle}</h2>
        </header>
        <ol className="room__how">
          {text.how.map((line, index) => (
            <li key={line}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{line}</p>
            </li>
          ))}
        </ol>
        <p className="room__note">{text.noAttachments}</p>
      </section>

      <section className="room__compose" aria-labelledby="room-compose-title">
        <header>
          <p>02</p>
          <div>
            <h2 id="room-compose-title">
              {locale === "fr-FR"
                ? "Écrire un message sécurisé"
                : "Write a secure message"}
            </h2>
            <p>
              {locale === "fr-FR"
                ? "Les champs restent fermés tant que la clé du destinataire n’est pas vérifiée."
                : "The fields stay closed until the recipient key has been verified."}
            </p>
          </div>
        </header>

        {status.kind === "loading" && (
          // The form only exists once the recipient key verifies, so the wait
          // shows the shape of that form rather than a sentence about waiting.
          <div
            className="room__skeleton"
            role="status"
            aria-label={text.checking}
            aria-busy="true"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} aria-hidden="true" />
            ))}
            <span className="room__skeleton--block" aria-hidden="true" />
            <span className="room__skeleton--action" aria-hidden="true" />
          </div>
        )}

        {status.kind === "unavailable" && (
          <div className="room__closed" role="alert">
            <h2>{text.unavailableTitle}</h2>
            <p>{text.unavailable}</p>
            <Link href={localizePath("/contact", locale)}>
              {text.useContact}
            </Link>
          </div>
        )}

        {status.kind === "sent" && (
          <div className="room__receipt" role="status">
            <h2>{text.sentTitle}</h2>
            <p className="room__reference">{status.reference}</p>
            <p>{text.sentBody}</p>
            <p>
              {text.deleteAfter}{" "}
              <time dateTime={status.deleteAfter}>
                {status.deleteAfter.slice(0, 10)}
              </time>
            </p>
          </div>
        )}

        {(status.kind === "ready" ||
          status.kind === "sending" ||
          status.kind === "failed") && (
          <form className="room__form" onSubmit={submit} noValidate>
            {status.kind === "failed" && (
              <p role="alert" className="room__error">
                {text.failed}
              </p>
            )}
            {invalid && (
              <p role="alert" className="room__error">
                {text.invalid}
              </p>
            )}

            <label htmlFor="room-name">{text.name}</label>
            <input
              id="room-name"
              name="fromName"
              required
              autoComplete="name"
              placeholder={
                locale === "fr-FR" ? "Votre nom complet" : "Your full name"
              }
            />

            <label htmlFor="room-email">{text.email}</label>
            <input
              id="room-email"
              name="fromEmail"
              type="email"
              required
              autoComplete="email"
              placeholder="name@example.com"
            />

            <label htmlFor="room-organisation">{text.organisation}</label>
            <input
              id="room-organisation"
              name="organisation"
              placeholder={
                locale === "fr-FR"
                  ? "Nom de l’organisation"
                  : "Organisation name"
              }
            />

            <label htmlFor="room-subject">{text.subject}</label>
            <input
              id="room-subject"
              name="subject"
              required
              placeholder={
                locale === "fr-FR"
                  ? "En quoi pouvons-nous vous aider\u00a0?"
                  : "What would you like to discuss?"
              }
            />

            <label htmlFor="room-message">{text.message}</label>
            <textarea
              id="room-message"
              name="message"
              rows={8}
              required
              placeholder={
                locale === "fr-FR"
                  ? "Décrivez le contexte, la demande et la prochaine étape souhaitée."
                  : "Describe the context, your request and the next step you have in mind."
              }
            />

            <div className="room__acknowledge">
              <input
                id="room-acknowledge"
                name="procurementAcknowledged"
                type="checkbox"
                required
              />
              <label htmlFor="room-acknowledge">{text.acknowledge}</label>
            </div>

            <button type="submit" disabled={status.kind === "sending"}>
              {status.kind === "sending" ? text.sending : text.send}
            </button>
          </form>
        )}
      </section>
      <aside className="room__exit">
        <p>
          {locale === "fr-FR"
            ? "Ce message n’a pas besoin d’être confidentiel\u00a0?"
            : "Does this message need ordinary handling instead?"}
        </p>
        <Link href={localizePath("/contact", locale)}>
          {locale === "fr-FR"
            ? "Retour au contact général"
            : "Return to general contact"}
          <span aria-hidden="true">↗</span>
        </Link>
      </aside>
    </main>
  );
}
