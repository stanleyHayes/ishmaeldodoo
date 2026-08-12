import { localizePath, type SupportedLocale } from "../i18n/locale";

export type PublicSearchResult = Readonly<{
  href: string;
  title: string;
  description: string;
}>;

const catalogue = [
  [
    "/record",
    "The Record",
    "Le parcours",
    "Biography, evidence and the four-act record.",
    "Biographie, preuves et parcours en quatre actes.",
  ],
  [
    "/record/atlas",
    "The Atlas",
    "L’Atlas",
    "Places, institutions and work across time.",
    "Lieux, institutions et travail au fil du temps.",
  ],
  [
    "/record/sources",
    "Source Register",
    "Registre des sources",
    "Published sources and evidence references.",
    "Sources publiées et références documentaires.",
  ],
  [
    "/speaking",
    "Speaking",
    "Interventions",
    "Themes, formats and published speaking history.",
    "Thèmes, formats et historique des interventions.",
  ],
  [
    "/signals",
    "Signal Board",
    "Tableau des signaux",
    "Sourced judgements, confidence and review criteria.",
    "Analyses sourcées, confiance et critères de révision.",
  ],
  [
    "/archive",
    "The Archive",
    "Les archives",
    "Speeches, interviews, broadcasts and transcripts.",
    "Discours, entretiens, émissions et transcriptions.",
  ],
  [
    "/legacy",
    "Legacy",
    "Héritage",
    "Consent-cleared scholar journeys.",
    "Parcours de chercheurs publiés avec consentement.",
  ],
  [
    "/press",
    "Press Room",
    "Espace presse",
    "Approved biographies, identity and press materials.",
    "Biographies, identité et documents de presse approuvés.",
  ],
  [
    "/contact",
    "Contact",
    "Contact",
    "General, speaking and media contact routes.",
    "Voies de contact générales, conférences et médias.",
  ],
  [
    "/legal/privacy",
    "Privacy notice",
    "Avis de confidentialité",
    "How personal information is handled.",
    "Comment les données personnelles sont traitées.",
  ],
  [
    "/legal/terms",
    "Terms of use",
    "Conditions d’utilisation",
    "Terms governing use of the platform.",
    "Conditions régissant l’utilisation de la plateforme.",
  ],
  [
    "/legal/disclosure",
    "Independence disclosure",
    "Déclaration d’indépendance",
    "Personal-capacity and independence disclosure.",
    "Déclaration de capacité personnelle et d’indépendance.",
  ],
] as const;

export function normalizeSearchQuery(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, 100);
}

export function searchPublicCatalogue(
  query: string,
  locale: SupportedLocale,
): readonly PublicSearchResult[] {
  const normalized = normalizeSearchQuery(query).toLocaleLowerCase(locale);
  if (!normalized) return [];
  const french = locale === "fr-FR";
  return catalogue
    .filter((entry) =>
      `${entry[french ? 2 : 1]} ${entry[french ? 4 : 3]}`
        .toLocaleLowerCase(locale)
        .includes(normalized),
    )
    .map((entry) => ({
      href: localizePath(entry[0], locale),
      title: entry[french ? 2 : 1],
      description: entry[french ? 4 : 3],
    }));
}
