"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  audienceCookieName,
  audienceDoorLabels,
  audienceKeys,
  audienceMaxAgeSeconds,
  audienceStorageName,
  type AudienceKey,
} from "../../lib/audience/adaptive-dossier";
import type { SupportedLocale } from "../../lib/i18n/locale";
import { trackAnalyticsEvent } from "../../lib/analytics-client";

function writePreference(audience: AudienceKey | null): void {
  if (audience) {
    window.localStorage.setItem(audienceStorageName, audience);
    document.cookie = `${audienceCookieName}=${audience}; Max-Age=${audienceMaxAgeSeconds}; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } else {
    window.localStorage.removeItem(audienceStorageName);
    document.cookie = `${audienceCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

export function AudienceDoors({
  locale,
  selected,
}: Readonly<{ locale: SupportedLocale; selected: AudienceKey | null }>) {
  const french = locale === "fr-FR";
  const root = french ? "/fr" : "/";

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const selectedByNavigation = parameters.get("door") as AudienceKey | null;
    if (selectedByNavigation && audienceKeys.includes(selectedByNavigation)) {
      writePreference(selectedByNavigation);
      return;
    }
    if (parameters.get("audience") === "reset") {
      writePreference(null);
      parameters.delete("audience");
      const query = parameters.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }
  }, []);

  return (
    <section className="audience-doors" aria-labelledby="audience-heading">
      <header>
        <p className="section-number">02</p>
        <div>
          <h2 id="audience-heading">
            {french
              ? "Pourquoi êtes-vous ici\u00a0?"
              : "What brought you here?"}
          </h2>
          <p>
            {french
              ? "Choisissez un angle. Aucun contenu ne sera masqué."
              : "Choose an emphasis. No content will be hidden."}
          </p>
        </div>
      </header>
      <div className="audience-doors__grid">
        {audienceKeys.map((audience) => (
          <Link
            key={audience}
            href={`/api/audience?door=${audience}&return=${encodeURIComponent(`${root}?door=${audience}`)}`}
            prefetch={false}
            aria-current={selected === audience ? "true" : undefined}
            onClick={() => {
              writePreference(audience);
              void trackAnalyticsEvent({
                name: "audience_selected",
                route: root,
                locale,
                audience,
              });
            }}
          >
            <span>{audienceDoorLabels[locale][audience]}</span>
            <small>{french ? "Choisir" : "Choose"}</small>
          </Link>
        ))}
      </div>
      <Link
        className="audience-reset"
        href={`/api/audience?return=${encodeURIComponent(`${root}?audience=reset`)}`}
        prefetch={false}
        aria-disabled={selected === null}
        onClick={() => writePreference(null)}
      >
        {french ? "Réinitialiser la vue" : "Reset view"}
      </Link>
    </section>
  );
}
