import type { SupportedLocale } from "../i18n/locale";

export const ROOM_PATH_EN = "/contact/room";
export const ROOM_PATH_FR = "/fr/contact/room";

/**
 * Reciprocal canonical and hreflang pairs for The Room. Declared here rather
 * than in the shared public page registry because the Room route is not a
 * CMS-resolved editorial page — its copy is a reviewed security control.
 */
export function roomAlternates(locale: SupportedLocale) {
  return {
    canonical: locale === "fr-FR" ? ROOM_PATH_FR : ROOM_PATH_EN,
    languages: {
      "en-GB": ROOM_PATH_EN,
      "fr-FR": ROOM_PATH_FR,
      "x-default": ROOM_PATH_EN,
    },
  } as const;
}
