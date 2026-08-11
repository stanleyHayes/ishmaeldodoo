"use client";

import { useState, type FormEvent } from "react";
import type { SupportedLocale } from "../../lib/i18n/locale";

export function LivingDossierForm({
  locale,
}: Readonly<{ locale: SupportedLocale }>) {
  const french = locale === "fr-FR";
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("working");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/living-dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterName: form.get("requesterName"),
          organisation: form.get("organisation"),
          email: form.get("email"),
          purpose: form.get("purpose"),
          variant: form.get("variant"),
          locale,
        }),
      });
      if (!response.ok) throw new Error("generation failed");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers.get("content-disposition") ?? "";
      link.download =
        disposition.match(/filename="?([^";]+)"?/u)?.[1] ??
        "amanor-dossier.pdf";
      link.click();
      URL.revokeObjectURL(url);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }
  return (
    <section
      className="press-section living-dossier"
      aria-labelledby="living-dossier-heading"
    >
      <div>
        <p className="section-number">06</p>
        <h2 id="living-dossier-heading">
          {french ? "Le dossier vivant" : "The Living Dossier"}
        </h2>
        <p>
          {french
            ? "Un document personnalisé, assemblé à partir du registre publié au moment de la demande."
            : "A personalised document assembled from the published record at the moment you request it."}
        </p>
      </div>
      <form className="press-kit-form" onSubmit={submit}>
        <label>
          {french ? "Votre nom" : "Your name"}
          <input name="requesterName" minLength={2} maxLength={100} required />
        </label>
        <label>
          {french ? "Organisation" : "Organisation"}
          <input name="organisation" minLength={2} maxLength={160} required />
        </label>
        <label>
          {french ? "Adresse e-mail" : "Email address"}
          <input name="email" type="email" maxLength={254} required />
        </label>
        <label>
          {french ? "Objectif du document" : "Purpose of the document"}
          <textarea
            name="purpose"
            minLength={10}
            maxLength={500}
            rows={4}
            required
          />
        </label>
        <fieldset>
          <legend>{french ? "Version" : "Variant"}</legend>
          <label>
            <input type="radio" name="variant" value="speaker" defaultChecked />{" "}
            {french ? "Dossier d’intervention" : "Speaker Pack"}
          </label>
          <label>
            <input type="radio" name="variant" value="institutional" />{" "}
            {french ? "Dossier institutionnel" : "Institutional Dossier"}
          </label>
          <label>
            <input type="radio" name="variant" value="full" />{" "}
            {french ? "Dossier complet" : "Full Record"}
          </label>
        </fieldset>
        <button type="submit" disabled={status === "working"}>
          {status === "working"
            ? french
              ? "Assemblage…"
              : "Assembling…"
            : french
              ? "Générer le dossier"
              : "Generate dossier"}
        </button>
        {status === "error" ? (
          <p role="alert">
            {french
              ? "Le dossier n’est pas disponible pour le moment."
              : "The dossier is unavailable right now."}
          </p>
        ) : null}
        <p className="form-note">
          {french
            ? "Le PDF porte une référence discrète et la demande est enregistrée pendant 180 jours."
            : "The PDF carries a discreet reference and the request receipt is retained for 180 days."}
        </p>
      </form>
    </section>
  );
}
