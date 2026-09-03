import Link from "next/link";
import {
  audienceDoorLabels,
  audienceDoorsAnchor,
  audienceKeys,
  type AudienceKey,
} from "../../lib/audience/adaptive-dossier";
import type { SupportedLocale } from "../../lib/i18n/locale";
import { audienceDoorsCopy } from "./audience-doors-copy";

export function AudienceDoorsStatic({
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
        {audienceKeys.map((audience) => (
          <Link
            key={audience}
            href={`/api/audience?door=${audience}&return=${encodeURIComponent(`${root}?door=${audience}&lite=1#${destinations[audience]}`)}`}
            prefetch={false}
            aria-current={selected === audience ? "true" : undefined}
          >
            <span>{audienceDoorLabels[locale][audience]}</span>
            <small>{copy.doorAction(selected === audience)}</small>
          </Link>
        ))}
      </div>
      <Link
        className="audience-reset"
        href={`/api/audience?return=${encodeURIComponent(`${root}?audience=reset&lite=1#${resetDestination}`)}`}
        prefetch={false}
        aria-disabled={selected === null}
      >
        {copy.reset}
      </Link>
    </section>
  );
}
