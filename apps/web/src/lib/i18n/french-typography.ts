import type { SupportedLocale } from "./locale";

const nonBreakingSpace = "\u00a0";
const technicalValue =
  /^(?:https?:\/\/|mailto:|tel:|\/)|^[^\s@]+@[^\s@]+\.[^\s@]+$/iu;

export function formatFrenchText(value: string): string {
  if (technicalValue.test(value)) return value;
  return value
    .replace(/«[ \t\u00a0\u202f]*/gu, `«${nonBreakingSpace}`)
    .replace(/[ \t\u00a0\u202f]*»/gu, `${nonBreakingSpace}»`)
    .replace(/[ \t\u00a0\u202f]+:/gu, `${nonBreakingSpace}:`)
    .replace(
      /([\p{L}\p{M}”’»\)\]])[ \t\u00a0\u202f]*:/gu,
      `$1${nonBreakingSpace}:`,
    )
    .replace(/([^\s])[ \t\u00a0\u202f]*([;!?]+)/gu, `$1${nonBreakingSpace}$2`);
}

export function typographyForLocale<T>(value: T, locale: SupportedLocale): T {
  if (locale !== "fr-FR") return value;
  if (typeof value === "string") return formatFrenchText(value) as T;
  if (value instanceof Date || value === null || value === undefined)
    return value;
  if (Array.isArray(value))
    return value.map((item) => typographyForLocale(item, locale)) as T;
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        typographyForLocale(item, locale),
      ]),
    ) as T;
  return value;
}
