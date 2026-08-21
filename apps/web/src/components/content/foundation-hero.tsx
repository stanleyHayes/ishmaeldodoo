import type { SupportedLocale } from "../../lib/i18n/locale";

const foundationCopy = {
  "en-GB": {
    label: "The Authority Platform",
    title: "A record built to remain accurate.",
    summary:
      "The application foundation is active. Public content remains intentionally unpublished until the canonical identity record and bilingual editorial workflow are approved.",
  },
  "fr-FR": {
    label: "La plateforme de référence",
    title: "Une source conçue pour rester exacte.",
    summary:
      "Le contenu éditorial français reste non publié jusqu’à l’approbation du registre d’identité et du processus bilingue.",
  },
} as const;

export function FoundationHero({
  locale,
  identity,
}: Readonly<{
  locale: SupportedLocale;
  identity?: Readonly<{ name: string; title?: string; positioning?: string }>;
}>) {
  const copy = foundationCopy[locale];
  const heading = identity?.name ?? copy.title;
  const headingWords = heading.split(/\s+/u);
  return (
    <section className="foundation-hero" aria-labelledby="foundation-title">
      <aside className="foundation-hero__rail" aria-hidden="true">
        <p>{locale === "fr-FR" ? "Index des sources" : "Source index"}</p>
        <ol>
          {Array.from({ length: 9 }, (_, index) => (
            <li key={index}>{String(index + 1).padStart(2, "0")}</li>
          ))}
        </ol>
        <span>
          {locale === "fr-FR"
            ? "Toutes les sources documentées"
            : "All sources documented"}
        </span>
      </aside>
      <div className="foundation-hero__declaration">
        <p className="foundation-hero__label">{copy.label}</p>
        <h1 id="foundation-title" aria-label={heading}>
          {headingWords.map((word, index) => (
            <span key={`${word}-${index}`} aria-hidden="true">
              {word}
              {index < headingWords.length - 1 ? " " : null}
            </span>
          ))}
        </h1>
        {identity?.title ? (
          <p className="foundation-hero__title">{identity.title}</p>
        ) : null}
      </div>
      <div className="foundation-hero__foot">
        <p className="foundation-hero__summary">
          {identity?.positioning ?? copy.summary}
        </p>
        <p className="foundation-hero__edition">
          <span>{locale === "fr-FR" ? "Dossier public" : "Public record"}</span>
          {locale === "fr-FR"
            ? "Bilingue · documenté · indépendant"
            : "Bilingual · sourced · independent"}
        </p>
      </div>
      <div className="foundation-hero__orbit" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>05° 33′ N</span>
        <span>00° 12′ W</span>
      </div>
    </section>
  );
}
