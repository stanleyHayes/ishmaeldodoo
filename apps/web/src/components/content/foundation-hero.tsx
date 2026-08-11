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
  return (
    <section className="foundation-hero" aria-labelledby="foundation-title">
      <p className="foundation-hero__label">{copy.label}</p>
      <h1 id="foundation-title">{identity?.name ?? copy.title}</h1>
      {identity?.title ? (
        <p className="foundation-hero__title">{identity.title}</p>
      ) : null}
      <p className="foundation-hero__summary">
        {identity?.positioning ?? copy.summary}
      </p>
    </section>
  );
}
