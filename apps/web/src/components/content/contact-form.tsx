"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import { BrandedSelect } from "../ui/branded-select";

const categoryLabels = {
  "en-GB": {
    general: "General enquiry",
    correction: "Correction to the public record",
    accessibility: "Accessibility support",
    website: "Website feedback",
    other: "Other",
  },
  "fr-FR": {
    general: "Demande générale",
    correction: "Correction du dossier public",
    accessibility: "Assistance à l’accessibilité",
    website: "Retour sur le site",
    other: "Autre",
  },
} as const;

const contactCategories = [
  "general",
  "correction",
  "accessibility",
  "website",
  "other",
] as const;

export function ContactForm({ locale }: Readonly<{ locale: SupportedLocale }>) {
  const french = locale === "fr-FR";
  const [result, setResult] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(undefined);
    const target = event.currentTarget;
    const form = new FormData(target);
    try {
      const response = await fetch("/api/contact-enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          organisation: form.get("organisation") || undefined,
          category: form.get("category"),
          subject: form.get("subject"),
          message: form.get("message"),
          locale,
          privacyConsent: form.get("privacyConsent") === "on",
        }),
      });
      const body = (await response.json()) as { reference?: string };
      if (!response.ok || !body.reference) throw new Error();
      setResult(
        `${french ? "Message reçu\u00a0:" : "Message received:"} ${body.reference}`,
      );
      target.reset();
    } catch {
      setResult(
        french
          ? "Envoi impossible pour le moment. Réessayez plus tard."
          : "Unable to submit right now. Please try again later.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="contact-workflow" aria-labelledby="contact-form-title">
      <header>
        <p className="page-kicker">
          {french ? "Demande générale" : "General contact"}
        </p>
        <div>
          <h2 id="contact-form-title">
            {french ? "Envoyer un message" : "Send a message"}
          </h2>
          <p>
            {french
              ? "Pour une invitation à intervenir, utilisez le Bureau du protocole. Les journalistes doivent utiliser le contact presse."
              : "For speaking invitations, use the Protocol Desk. Journalists should use the dedicated media contact."}
          </p>
          <nav
            aria-label={french ? "Contacts spécialisés" : "Specialist contacts"}
          >
            <Link href={localizePath("/speaking/request", locale)}>
              {french ? "Bureau du protocole" : "Protocol Desk"}
            </Link>
            <Link href={localizePath("/press/contact", locale)}>
              {french ? "Contact presse" : "Media contact"}
            </Link>
            <Link href={localizePath("/contact/room", locale)}>
              {french ? "La Chambre" : "The Room"}
            </Link>
          </nav>
        </div>
      </header>
      <aside className="contact-safety" role="note">
        <strong>
          {french
            ? "Ne transmettez rien de confidentiel."
            : "Do not send confidential material."}
        </strong>{" "}
        {/*
          The warning stays one intact sentence and the route follows it. An
          earlier attempt wrapped the words "The Room" inside the sentence,
          which split it across elements and made every text assertion against
          it depend on how a given engine resolves a parent's text content.
        */}
        {french
          ? "Ce formulaire général n’est pas The Room et ne fournit pas son niveau de protection."
          : "This general form is not The Room and does not provide its protected handling boundary."}{" "}
        <Link href={localizePath("/contact/room", locale)}>
          {french ? "Ouvrir La Chambre" : "Open The Room"}
        </Link>
      </aside>
      <form onSubmit={submit} className="contact-form">
        <label>
          {french ? "Votre nom" : "Your name"}
          <input name="name" minLength={2} maxLength={100} required />
        </label>
        <label>
          {french ? "Adresse e-mail" : "Email address"}
          <input name="email" type="email" maxLength={254} required />
        </label>
        <label>
          {french ? "Organisation (facultatif)" : "Organisation (optional)"}
          <input name="organisation" minLength={2} maxLength={160} />
        </label>
        <BrandedSelect
          name="category"
          label={french ? "Type de demande" : "Enquiry type"}
          defaultValue="general"
          options={contactCategories.map((category) => ({
            value: category,
            label: categoryLabels[locale][category],
          }))}
        />
        <label className="contact-form-wide">
          {french ? "Objet" : "Subject"}
          <input name="subject" minLength={4} maxLength={160} required />
        </label>
        <label className="contact-form-wide">
          {french ? "Message" : "Message"}
          <textarea
            name="message"
            minLength={20}
            maxLength={4000}
            rows={8}
            required
          />
        </label>
        <label className="contact-consent contact-form-wide">
          <input name="privacyConsent" type="checkbox" required />
          <span>
            {french
              ? "J’accepte le traitement de ces informations pour répondre à ma demande. Les messages sont supprimés automatiquement après 180 jours."
              : "I consent to these details being processed to answer my enquiry. Messages are automatically deleted after 180 days."}
          </span>
        </label>
        <button disabled={busy} className="contact-form-wide">
          {busy
            ? french
              ? "Envoi…"
              : "Sending…"
            : french
              ? "Envoyer le message"
              : "Send message"}
        </button>
        {result ? (
          <p role="status" className="contact-form-wide">
            {result}
          </p>
        ) : null}
      </form>
    </section>
  );
}
