"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent } from "react";
import {
  audienceCookieName,
  audienceDoorLabels,
  audienceDoorsAnchor,
  audienceKeys,
  audienceMaxAgeSeconds,
  audienceStorageName,
  type AudienceKey,
} from "../../lib/audience/adaptive-dossier";
import type { SupportedLocale } from "../../lib/i18n/locale";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import { audienceDoorsCopy } from "./audience-doors-copy";

function writePreference(audience: AudienceKey | null): void {
  if (audience) {
    window.localStorage.setItem(audienceStorageName, audience);
    document.cookie = `${audienceCookieName}=${audience}; Max-Age=${audienceMaxAgeSeconds}; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } else {
    window.localStorage.removeItem(audienceStorageName);
    document.cookie = `${audienceCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

// The browser handles modified clicks itself (new tab, save, download), so the
// no-JavaScript href stays authoritative for them.
function opensElsewhere(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

export function AudienceDoors({
  locale,
  selected,
  destinations,
  resetDestination = audienceDoorsAnchor,
}: Readonly<{
  locale: SupportedLocale;
  selected: AudienceKey | null;
  destinations: Readonly<Record<AudienceKey, string>>;
  resetDestination?: string;
}>) {
  const copy = audienceDoorsCopy(locale);
  const root = locale === "fr-FR" ? "/fr" : "/";
  const router = useRouter();
  // A client transition swaps the server payload without moving the viewport,
  // and `Response.url` drops the fragment on the redirect path, so the landing
  // section is remembered here and applied once the requested blocks arrive.
  const pending = useRef<{
    audience: AudienceKey | null;
    anchor: string;
  } | null>(null);

  useEffect(() => {
    if (!pending.current || pending.current.audience !== selected) return;
    const destination = document.getElementById(pending.current.anchor);
    if (!destination) return;
    pending.current = null;
    destination.scrollIntoView({ block: "start" });
  });

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
  }, [selected]);

  function open(audience: AudienceKey | null, anchor: string, href: string) {
    // Nothing has to arrive when the choice is unchanged: the requested blocks
    // are already on screen.
    if (audience === selected) {
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
    } else {
      pending.current = { audience, anchor };
    }
    router.push(href, { scroll: false });
  }

  return (
    <section className="audience-doors" aria-labelledby="audience-heading">
      <header>
        <p className="section-number">02</p>
        <div>
          <h2 id="audience-heading">{copy.heading}</h2>
          <p>{copy.guidance}</p>
          <p className="audience-doors__status" role="status">
            {copy.status(selected)}
          </p>
        </div>
      </header>
      <div className="audience-doors__grid">
        {audienceKeys.map((audience) => {
          const anchor = destinations[audience];
          const target = `${root}?door=${audience}#${anchor}`;
          return (
            <Link
              key={audience}
              href={`/api/audience?door=${audience}&return=${encodeURIComponent(target)}`}
              prefetch={false}
              aria-current={selected === audience ? "true" : undefined}
              onClick={(event) => {
                writePreference(audience);
                void trackAnalyticsEvent({
                  name: "audience_selected",
                  route: root,
                  locale,
                  audience,
                });
                if (opensElsewhere(event)) return;
                event.preventDefault();
                open(audience, anchor, target);
              }}
            >
              <span>{audienceDoorLabels[locale][audience]}</span>
              <small>{copy.doorAction(selected === audience)}</small>
            </Link>
          );
        })}
      </div>
      <Link
        className="audience-reset"
        href={`/api/audience?return=${encodeURIComponent(`${root}?audience=reset#${resetDestination}`)}`}
        prefetch={false}
        aria-disabled={selected === null}
        onClick={(event) => {
          writePreference(null);
          if (opensElsewhere(event)) return;
          event.preventDefault();
          open(
            null,
            resetDestination,
            `${root}?audience=reset#${resetDestination}`,
          );
        }}
      >
        {copy.reset}
      </Link>
    </section>
  );
}
