import type { Locale } from "./types";

export type TranslationSummary = Readonly<{
  stale: boolean;
  sourceUpdatedAt?: Date;
}>;

export function projectPublicLocale(value: unknown, locale: Locale): unknown {
  if (value instanceof Date || value === null || typeof value !== "object")
    return value;
  if (Array.isArray(value))
    return value.map((item) => projectPublicLocale(item, locale));

  const record = value as Record<string, unknown>;
  if (
    typeof record["en-GB"] === "string" &&
    typeof record["fr-FR"] === "string" &&
    record.status !== null &&
    typeof record.status === "object"
  ) {
    return record[locale];
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      projectPublicLocale(item, locale),
    ]),
  );
}

export function summarizeTranslation(
  value: unknown,
  locale: Locale,
): TranslationSummary {
  let stale = false;
  let sourceUpdatedAt: Date | undefined;
  function visit(item: unknown): void {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record["en-GB"] === "string" &&
      typeof record["fr-FR"] === "string" &&
      record.status &&
      typeof record.status === "object"
    ) {
      const status = record.status as Record<string, unknown>;
      if (status[locale] === "stale") stale = true;
      const updated = new Date(String(record.sourceUpdatedAt));
      if (
        !Number.isNaN(updated.getTime()) &&
        (!sourceUpdatedAt || updated > sourceUpdatedAt)
      )
        sourceUpdatedAt = updated;
      return;
    }
    Object.values(record).forEach(visit);
  }
  visit(value);
  return { stale, ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}) };
}
