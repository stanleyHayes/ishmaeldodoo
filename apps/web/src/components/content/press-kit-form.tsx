"use client";

import { useState, type FormEvent } from "react";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import type { SupportedLocale } from "../../lib/i18n/locale";

export function PressKitForm({
  locale,
}: Readonly<{ locale: SupportedLocale }>) {
  const french = locale === "fr-FR";
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("working");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/press-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterName: form.get("requesterName"),
          outlet: form.get("outlet"),
          email: form.get("email"),
          locale,
          format: form.get("format"),
        }),
      });
      if (!response.ok) throw new Error("generation failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers.get("content-disposition") ?? "";
      link.download =
        disposition.match(/filename="?([^";]+)"?/u)?.[1] ?? "amanor-press-kit";
      link.click();
      URL.revokeObjectURL(url);
      setStatus("idle");
      void trackAnalyticsEvent({
        name: "press_kit_requested",
        route: `${french ? "/fr" : ""}/press`,
        locale,
      });
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="press-kit-form" onSubmit={submit}>
      <label>
        {french ? "Votre nom" : "Your name"}
        <input name="requesterName" minLength={2} maxLength={100} required />
      </label>
      <label>
        {french ? "Média" : "Outlet"}
        <input name="outlet" minLength={2} maxLength={160} required />
      </label>
      <label>
        {french ? "Adresse e-mail" : "Email address"}
        <input name="email" type="email" maxLength={254} required />
      </label>
      <fieldset>
        <legend>{french ? "Format" : "Format"}</legend>
        <label>
          <input type="radio" name="format" value="pdf" defaultChecked /> PDF
        </label>
        <label>
          <input type="radio" name="format" value="zip" /> ZIP
        </label>
      </fieldset>
      <button type="submit" disabled={status === "working"}>
        {status === "working"
          ? french
            ? "Préparation…"
            : "Preparing…"
          : french
            ? "Générer le dossier"
            : "Generate press kit"}
      </button>
      {status === "error" ? (
        <p role="alert">
          {french
            ? "Le dossier n’est pas disponible pour le moment. Réessayez."
            : "The press kit is unavailable right now. Please try again."}
        </p>
      ) : null}
      <p className="form-note">
        {french
          ? "Téléchargement immédiat. Votre demande est enregistrée pour le suivi presse."
          : "Immediate download. Your request is logged for press follow-up."}
      </p>
    </form>
  );
}
