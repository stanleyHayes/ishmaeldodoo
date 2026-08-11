export const supportedLocales = ["en-GB", "fr-FR"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = "en-GB";
export const localeCookieName = "amanor_locale";

export function localeFromPathname(pathname: string): SupportedLocale {
  return pathname === "/fr" || pathname.startsWith("/fr/")
    ? "fr-FR"
    : defaultLocale;
}

export function preferredLocale(
  acceptLanguage: string | null,
): SupportedLocale {
  if (!acceptLanguage) return defaultLocale;
  const preferences = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [language = "", ...parameters] = part.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const parsedQuality = qualityParameter
        ? Number(qualityParameter.trim().slice(2))
        : 1;
      return {
        index,
        language: language.toLowerCase(),
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
      };
    })
    .filter(({ quality }) => quality > 0)
    .sort(
      (left, right) => right.quality - left.quality || left.index - right.index,
    );

  for (const preference of preferences) {
    if (preference.language === "fr" || preference.language.startsWith("fr-"))
      return "fr-FR";
    if (preference.language === "en" || preference.language.startsWith("en-"))
      return "en-GB";
    if (preference.language === "*") return defaultLocale;
  }
  return defaultLocale;
}

export function localizePath(
  pathname: string,
  locale: SupportedLocale,
): string {
  const suffixIndex = pathname.search(/[?#]/u);
  const pathOnly =
    suffixIndex === -1 ? pathname : pathname.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : pathname.slice(suffixIndex);
  const normalized =
    pathOnly === "/fr" ? "/" : pathOnly.replace(/^\/fr(?=\/)/u, "");
  if (locale === "en-GB") return `${normalized || "/"}${suffix}`;
  return `${normalized === "/" ? "/fr" : `/fr${normalized}`}${suffix}`;
}

export function safeReturnPath(candidate: string | null): string {
  if (
    !candidate ||
    candidate.length > 2_048 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//")
  )
    return "/";
  if (/[\\\u0000-\u001f]/u.test(candidate)) return "/";
  return candidate;
}
