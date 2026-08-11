import type { SupportedLocale } from "../i18n/locale";

export const publicPageRoutes = {
  record: "record",
  "record/atlas": "record-atlas",
  speaking: "speaking",
  "speaking/request": "speaking-request",
  signals: "signals",
  press: "press",
  doctrine: "doctrine",
  archive: "archive",
  legacy: "legacy",
  "office-hours": "office-hours",
  selah: "selah",
  contact: "contact",
  "record/sources": "record-sources",
  "legal/privacy": "legal-privacy",
  "legal/terms": "legal-terms",
  "legal/disclosure": "legal-disclosure",
} as const;

export type PublicPagePath = keyof typeof publicPageRoutes;

export function publicPageId(segments: readonly string[]): string | null {
  const path = segments.join("/") as PublicPagePath;
  return publicPageRoutes[path] ?? null;
}

export function localizedRoute(path: PublicPagePath, locale: SupportedLocale) {
  return locale === "fr-FR" ? `/fr/${path}` : `/${path}`;
}

export function pageAlternates(
  path: PublicPagePath,
  locale: SupportedLocale = "en-GB",
) {
  return {
    canonical: localizedRoute(path, locale),
    languages: {
      "en-GB": `/${path}`,
      "fr-FR": `/fr/${path}`,
      "x-default": `/${path}`,
    },
  } as const;
}
