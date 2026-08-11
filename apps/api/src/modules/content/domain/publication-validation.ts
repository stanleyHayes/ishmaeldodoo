import type { ContentKind, Locale, LocalizedText } from "./types";
import type { GovernedMediaReference } from "../../media/domain/media";
import { localizedTextSchema } from "./types";
import { publishableSchemas } from "./schemas";

type ValidationResult =
  | Readonly<{ valid: true }>
  | Readonly<{ valid: false; errors: readonly string[] }>;

export type PublicationValidationContext = Readonly<{
  authorId?: string;
  reviewerId?: string;
}>;

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

export function collectGovernedMediaReferences(
  kind: ContentKind,
  payload: unknown,
): readonly GovernedMediaReference[] {
  const record = payloadRecord(payload);
  if (!record) return [];
  const references: GovernedMediaReference[] = [];
  const add = (
    assetId: unknown,
    resourceType: "image" | "video",
    path: string,
    folder?: GovernedMediaReference["folder"],
  ): void => {
    if (typeof assetId === "string")
      references.push({
        assetId,
        resourceType,
        path,
        ...(folder ? { folder } : {}),
      });
  };

  if (kind === "identity") {
    if (Array.isArray(record.portraits))
      record.portraits.forEach((assetId, index) =>
        add(assetId, "image", `portraits.${index}`, "portraits"),
      );
    add(record.pronunciationAudio, "video", "pronunciationAudio");
  } else if (kind === "atlasNode") {
    add(record.image, "image", "image", "atlas");
  } else if (kind === "scholar") {
    add(record.photo, "image", "photo", "scholars");
  } else if (kind === "speakingTheme" && Array.isArray(record.media)) {
    record.media.forEach((item, index) => {
      const media = payloadRecord(item);
      if (media && (media.kind === "image" || media.kind === "video"))
        add(media.assetId, media.kind, `media.${index}.assetId`, "speaking");
    });
  } else if (kind === "page") {
    add(record.ogImage, "image", "ogImage");
    if (Array.isArray(record.sections))
      record.sections.forEach((item, sectionIndex) => {
        const section = payloadRecord(item);
        if (!section) return;
        add(section.fieldImage, "image", `sections.${sectionIndex}.fieldImage`);
        if (Array.isArray(section.marginalia))
          section.marginalia.forEach((entry, marginaliaIndex) => {
            const marginalia = payloadRecord(entry);
            if (marginalia)
              add(
                marginalia.image,
                "image",
                `sections.${sectionIndex}.marginalia.${marginaliaIndex}.image`,
              );
          });
      });
  }
  return references;
}

export function collectSourceReferences(value: unknown): readonly string[] {
  const references = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      if (key === "sourceRef" && typeof nested === "string")
        references.add(nested.trim());
      else if (key.endsWith("SourceRefs") || key === "sourceRefs") {
        if (Array.isArray(nested))
          nested.forEach((reference) => {
            if (typeof reference === "string") references.add(reference.trim());
          });
      } else visit(nested);
    }
  };
  visit(value);
  references.delete("");
  return [...references].sort();
}

function collectLocalizedFields(
  value: unknown,
  path = "payload",
): ReadonlyArray<[string, LocalizedText]> {
  const fields: Array<[string, LocalizedText]> = [];

  if (!value || typeof value !== "object") return fields;
  const parsed = localizedTextSchema.safeParse(value);
  if (parsed.success) return [[path, parsed.data]];

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      fields.push(...collectLocalizedFields(item, `${path}[${index}]`)),
    );
    return fields;
  }

  for (const [key, item] of Object.entries(value)) {
    fields.push(...collectLocalizedFields(item, `${path}.${key}`));
  }
  return fields;
}

export function validateForPublication(
  kind: ContentKind,
  payload: unknown,
  locale: Locale,
  context: PublicationValidationContext = {},
): ValidationResult {
  const schema = publishableSchemas[kind];
  const errors: string[] = [];

  if (schema) {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      errors.push(
        ...parsed.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        ),
      );
    }
  }

  for (const [path, field] of collectLocalizedFields(payload)) {
    if (!field[locale] || field.status[locale] === "missing") {
      errors.push(`${path}.${locale}: translation is missing`);
    }
  }

  if (kind === "scholar" && typeof payload === "object" && payload !== null) {
    const scholar = payload as { consentStatus?: string };
    if (scholar.consentStatus !== "granted") {
      errors.push(
        "consentStatus: scholar cannot be published without granted consent",
      );
    }
  }

  if (kind === "signal" && typeof payload === "object" && payload !== null) {
    const signal = payload as {
      tags?: unknown;
      approvedBy?: unknown;
      sourceRefs?: unknown;
    };
    if (!Array.isArray(signal.sourceRefs) || signal.sourceRefs.length === 0)
      errors.push(
        "sourceRefs: a Signal cannot be published without source evidence",
      );
    const policyTagged = Array.isArray(signal.tags) && signal.tags.length > 0;
    if (
      policyTagged &&
      (!context.authorId ||
        !context.reviewerId ||
        context.authorId === context.reviewerId ||
        signal.approvedBy !== context.reviewerId)
    )
      errors.push(
        "approvedBy: policy-tagged signal requires a different recorded approver",
      );
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
