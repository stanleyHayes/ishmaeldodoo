import Link from "next/link";
import {
  audienceDoorLabels,
  audienceKeys,
  type AudienceKey,
} from "../../lib/audience/adaptive-dossier";
import type { SupportedLocale } from "../../lib/i18n/locale";

export function AudienceDoorsStatic({
  locale,
  selected,
}: Readonly<{ locale: SupportedLocale; selected: AudienceKey | null }>) {
  const french = locale === "fr-FR";
  const root = french ? "/fr" : "/";
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
            href={`/api/audience?door=${audience}&return=${encodeURIComponent(`${root}?door=${audience}&lite=1`)}`}
            prefetch={false}
            aria-current={selected === audience ? "true" : undefined}
          >
            <span>{audienceDoorLabels[locale][audience]}</span>
            <small>{french ? "Choisir" : "Choose"}</small>
          </Link>
        ))}
      </div>
      <Link
        className="audience-reset"
        href={`/api/audience?return=${encodeURIComponent(`${root}?audience=reset&lite=1`)}`}
        prefetch={false}
        aria-disabled={selected === null}
      >
        {french ? "Réinitialiser la vue" : "Reset view"}
      </Link>
    </section>
  );
}
