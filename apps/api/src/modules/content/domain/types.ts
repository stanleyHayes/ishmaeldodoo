import { z } from "zod";

export const locales = ["en-GB", "fr-FR"] as const;
export const localeSchema = z.enum(locales);
export type Locale = z.infer<typeof localeSchema>;

export const translationStatuses = ["current", "stale", "missing"] as const;
export const translationStatusSchema = z.enum(translationStatuses);
export type TranslationStatus = z.infer<typeof translationStatusSchema>;

export const localizedTextSchema = z.object({
  "en-GB": z.string().trim().min(1),
  "fr-FR": z.string().trim().default(""),
  status: z.object({
    "en-GB": translationStatusSchema.default("current"),
    "fr-FR": translationStatusSchema,
  }),
  sourceUpdatedAt: z.coerce.date(),
});

export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const contentKinds = [
  "identity",
  "atlasNode",
  "speakingTheme",
  "signal",
  "archiveItem",
  "source",
  "scholar",
  "officeHoursCycle",
  "officeHoursAnswer",
  "selahEntry",
  "riderTemplate",
  "emailTemplate",
  "page",
  "blackout",
  "counterparty",
  "deskConfiguration",
] as const;

export const contentKindSchema = z.enum(contentKinds);
export type ContentKind = z.infer<typeof contentKindSchema>;

export const editorialRoles = [
  "principal",
  "desk_officer",
  "editor",
  "translator",
  "reviewer",
  "press_officer",
  "trust_admin",
  "security_admin",
] as const;

export const editorialRoleSchema = z.enum(editorialRoles);
export type EditorialRole = z.infer<typeof editorialRoleSchema>;

export type EditorialActor = Readonly<{
  id: string;
  roles: readonly EditorialRole[];
}>;

export function markFrenchStale(
  previous: LocalizedText,
  nextEnglish: string,
): LocalizedText {
  const changed = previous["en-GB"] !== nextEnglish.trim();
  return {
    ...previous,
    "en-GB": nextEnglish.trim(),
    status: {
      "en-GB": "current",
      "fr-FR": changed ? "stale" : previous.status["fr-FR"],
    },
    sourceUpdatedAt: changed ? new Date() : previous.sourceUpdatedAt,
  };
}

export function localeCanRender(field: LocalizedText, locale: Locale): boolean {
  return Boolean(field[locale]) && field.status[locale] !== "missing";
}
