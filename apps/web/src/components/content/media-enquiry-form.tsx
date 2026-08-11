"use client";
import { useState, type FormEvent } from "react";
import type { SupportedLocale } from "../../lib/i18n/locale";
export function MediaEnquiryForm({
  locale,
}: Readonly<{ locale: SupportedLocale }>) {
  const fr = locale === "fr-FR";
  const [result, setResult] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/media-enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          outlet: form.get("outlet"),
          email: form.get("email"),
          deadline: form.get("deadline")
            ? new Date(String(form.get("deadline"))).toISOString()
            : undefined,
          subject: form.get("subject"),
          message: form.get("message"),
          locale,
        }),
      });
      const body = (await response.json()) as { reference?: string };
      if (!response.ok || !body.reference) throw new Error();
      setResult(
        `${fr ? "Demande reçue\u00a0:" : "Enquiry received:"} ${body.reference}`,
      );
      event.currentTarget.reset();
    } catch {
      setResult(
        fr
          ? "Envoi impossible pour le moment. Réessayez."
          : "Unable to submit right now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="press-kit-form" onSubmit={submit}>
      <label>
        {fr ? "Votre nom" : "Your name"}
        <input name="name" minLength={2} maxLength={100} required />
      </label>
      <label>
        {fr ? "Média" : "Outlet"}
        <input name="outlet" minLength={2} maxLength={160} required />
      </label>
      <label>
        {fr ? "Adresse e-mail" : "Email address"}
        <input name="email" type="email" required />
      </label>
      <label>
        {fr ? "Échéance (facultatif)" : "Deadline (optional)"}
        <input name="deadline" type="datetime-local" />
      </label>
      <label>
        {fr ? "Objet" : "Subject"}
        <input name="subject" minLength={4} maxLength={160} required />
      </label>
      <label>
        {fr ? "Demande" : "Enquiry"}
        <textarea
          name="message"
          minLength={20}
          maxLength={4000}
          rows={8}
          required
        />
      </label>
      <button disabled={busy}>
        {busy
          ? fr
            ? "Envoi…"
            : "Sending…"
          : fr
            ? "Envoyer au contact presse"
            : "Send to press contact"}
      </button>
      <p className="form-note">
        {fr
          ? "Ces informations sont transmises uniquement au contact presse désigné et conservées pendant 180 jours."
          : "These details go only to the designated press contact and are retained for 180 days."}
      </p>
      {result ? <p role="status">{result}</p> : null}
    </form>
  );
}
