"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { SupportedLocale } from "../../lib/i18n/locale";
import {
  analyticsRoutes,
  type AnalyticsConsent,
} from "../../lib/analytics-catalog";
import { trackAnalyticsEvent } from "../../lib/analytics-client";

function subscribeToHydration(): () => void {
  return () => undefined;
}

export function AnalyticsConsentControl({
  locale,
  initialConsent,
}: Readonly<{ locale: SupportedLocale; initialConsent: AnalyticsConsent }>) {
  const [consent, setConsent] = useState(initialConsent);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const french = locale === "fr-FR";

  useEffect(() => {
    if (
      consent !== "granted" ||
      !analyticsRoutes.includes(window.location.pathname)
    )
      return;
    const key = `amanor-pageview:${window.location.pathname}`;
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
    void trackAnalyticsEvent({
      name: "pageview",
      route: window.location.pathname,
      locale,
    });
  }, [consent, locale]);

  async function choose(granted: boolean): Promise<void> {
    const response = await fetch("/api/analytics/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ granted }),
    });
    if (response.ok) setConsent(granted ? "granted" : "denied");
  }

  if (consent) {
    return (
      <div className="analytics-preference site-frame">
        <span>
          {french
            ? consent === "granted"
              ? "Mesure anonyme activée"
              : "Aucune mesure analytique"
            : consent === "granted"
              ? "Anonymous analytics enabled"
              : "No analytics"}
        </span>
        <button
          type="button"
          disabled={!hydrated}
          onClick={() => setConsent(null)}
        >
          {french ? "Modifier" : "Change"}
        </button>
      </div>
    );
  }

  return (
    <aside
      className="analytics-consent"
      aria-labelledby="analytics-consent-title"
    >
      <div className="analytics-consent__inner site-frame">
        <div>
          <h2 id="analytics-consent-title">
            {french
              ? "Mesure respectueuse de la vie privée"
              : "Privacy-respecting measurement"}
          </h2>
          <p>
            {french
              ? "Avec votre accord, nous comptons uniquement les usages généraux. Aucun nom, contact, texte libre ou identifiant n’est collecté."
              : "With your permission, we count only broad site use. We collect no names, contact details, free text, or identifiers."}
          </p>
          <Link href={french ? "/fr/legal/privacy" : "/legal/privacy"}>
            {french
              ? "Lire la politique de confidentialité"
              : "Read the privacy policy"}
          </Link>
        </div>
        <div className="analytics-consent__actions">
          <button
            type="button"
            disabled={!hydrated}
            onClick={() => void choose(true)}
          >
            {french ? "Autoriser la mesure" : "Allow measurement"}
          </button>
          <button
            type="button"
            disabled={!hydrated}
            onClick={() => void choose(false)}
          >
            {french ? "Refuser" : "Decline"}
          </button>
        </div>
      </div>
    </aside>
  );
}
