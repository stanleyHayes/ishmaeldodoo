import { Injectable } from "@nestjs/common";
import type { SourceAuditReport } from "@amanor/contracts";
import { hasPermission, type Permission } from "../../auth/domain/roles";
import { createEditorialDiff, type EditorialAuditEvent } from "./audit";
import {
  collectGovernedMediaReferences,
  collectSourceReferences,
  validateForPublication,
} from "../domain/publication-validation";
import { MediaReferenceService } from "../../media/application/media-reference.service";
import type { GovernedMediaReference } from "../../media/domain/media";
import { publishableSchemas } from "../domain/schemas";
import type { ContentKind, EditorialActor, Locale } from "../domain/types";
import {
  publicationTags,
  transitionContent,
  type AuditExport,
  type ContentDocumentPage,
  type ContentVersion,
  type EditorialAuditIntegrity,
  type Publication,
  type Unpublication,
  type WorkflowAction,
} from "../domain/workflow";
import {
  CmsRepository,
  type PublicSourcePage,
} from "../persistence/cms.repository";
import {
  projectPublicLocale,
  summarizeTranslation,
  type TranslationSummary,
} from "../domain/public-projection";

const deskContentKinds = new Set<ContentKind>([
  "blackout",
  "counterparty",
  "deskConfiguration",
]);

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left instanceof Date && right instanceof Date)
    return left.getTime() === right.getTime();
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = new Set([
      ...Object.keys(leftRecord),
      ...Object.keys(rightRecord),
    ]);
    return [...keys].every((key) =>
      sameValue(leftRecord[key], rightRecord[key]),
    );
  }
  return false;
}

function translationOnlyChange(previous: unknown, next: unknown): boolean {
  if (sameValue(previous, next)) return true;
  if (
    !previous ||
    !next ||
    typeof previous !== "object" ||
    typeof next !== "object"
  )
    return false;
  if (Array.isArray(previous) || Array.isArray(next)) {
    if (!Array.isArray(previous) || !Array.isArray(next)) return false;
    return (
      previous.length === next.length &&
      previous.every((value, index) =>
        translationOnlyChange(value, next[index]),
      )
    );
  }
  const previousRecord = previous as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(previousRecord),
    ...Object.keys(nextRecord),
  ]);
  return [...keys].every(
    (key) =>
      key === "fr-FR" ||
      translationOnlyChange(previousRecord[key], nextRecord[key]),
  );
}

@Injectable()
export class CmsService {
  constructor(
    private readonly repository: CmsRepository,
    private readonly mediaReferences?: MediaReferenceService,
  ) {}

  async createDraft(
    documentType: ContentKind,
    documentId: string,
    payload: unknown,
    actor: EditorialActor,
  ): Promise<ContentVersion> {
    this.assertDraftPermission(documentType, actor);
    const schema = publishableSchemas[documentType];
    const parsed = schema.parse(payload);
    if (
      hasPermission(actor.roles, "content:translate") &&
      !hasPermission(actor.roles, "content:write")
    ) {
      const previous = await this.repository.findLatestVersion(
        documentType,
        documentId,
      );
      if (!previous)
        throw new Error(
          "Translation permission cannot create a new content document",
        );
      const previousParsed = schema.parse(previous.payload);
      if (!translationOnlyChange(previousParsed, parsed))
        throw new Error(
          "Translation permission may change only French-localized fields",
        );
    }
    const version = await this.repository.createDraft({
      documentType,
      documentId,
      authorId: actor.id,
      payload: parsed,
    });
    return version;
  }

  async listVersions(
    documentType: ContentKind,
    documentId: string,
  ): Promise<readonly ContentVersion[]> {
    return this.repository.listVersions(documentType, documentId);
  }

  async listDocuments(
    documentType: ContentKind,
    limit = 50,
    cursor?: string,
  ): Promise<ContentDocumentPage> {
    return this.repository.listDocuments(
      documentType,
      Math.max(1, Math.min(limit, 100)),
      cursor,
    );
  }

  async sourceAudit(actor: EditorialActor): Promise<SourceAuditReport> {
    this.assertPermission(actor, "content:review", "review source evidence");
    const rows = await this.repository.listPublishedForSourceAudit();
    const sourceRows = rows.filter((row) => row.documentType === "source");
    const sourcesByDocument = new Map<
      string,
      { ref: string; locales: Set<Locale> }
    >();
    for (const row of sourceRows) {
      const rawRef =
        row.payload && typeof row.payload === "object"
          ? (row.payload as { ref?: unknown }).ref
          : undefined;
      const ref = typeof rawRef === "string" ? rawRef.trim() : "";
      if (!ref)
        throw new Error(`Published source ${row.documentId} has no reference`);
      const current = sourcesByDocument.get(row.documentId) ?? {
        ref,
        locales: new Set<Locale>(),
      };
      if (current.ref !== ref)
        throw new Error(
          `Published source ${row.documentId} changes reference by locale`,
        );
      current.locales.add(row.locale);
      sourcesByDocument.set(row.documentId, current);
    }
    const sourceDocumentsByRef = new Map<string, Set<string>>();
    for (const [documentId, source] of sourcesByDocument) {
      const documents =
        sourceDocumentsByRef.get(source.ref) ?? new Set<string>();
      documents.add(documentId);
      sourceDocumentsByRef.set(source.ref, documents);
    }
    const claims = rows
      .filter((row) => row.documentType !== "source")
      .map((row) => {
        const sourceRefs = [...collectSourceReferences(row.payload)];
        const missingSourceRefs = sourceRefs.filter((ref) => {
          const documents = sourceDocumentsByRef.get(ref);
          return (
            !documents ||
            ![...documents].some((documentId) =>
              sourcesByDocument.get(documentId)?.locales.has(row.locale),
            )
          );
        });
        return {
          documentType: row.documentType,
          documentId: row.documentId,
          locale: row.locale,
          version: row.version,
          sourceRefs,
          missingSourceRefs,
        };
      });
    const dependentCounts = new Map<string, number>();
    for (const claim of claims)
      for (const ref of claim.sourceRefs)
        dependentCounts.set(ref, (dependentCounts.get(ref) ?? 0) + 1);
    const sources = [...sourcesByDocument.entries()]
      .map(([documentId, source]) => {
        const duplicate = (sourceDocumentsByRef.get(source.ref)?.size ?? 0) > 1;
        const dependentPublications = dependentCounts.get(source.ref) ?? 0;
        return {
          documentId,
          ref: source.ref,
          locales: [...source.locales].sort(),
          dependentPublications,
          status: duplicate
            ? ("duplicate_ref" as const)
            : dependentPublications === 0
              ? ("unused" as const)
              : ("used" as const),
        };
      })
      .sort((left, right) => left.ref.localeCompare(right.ref));
    return {
      generatedAt: new Date(),
      totals: {
        publications: rows.length,
        sourceEntries: sources.length,
        claimReferences: claims.reduce(
          (total, claim) => total + claim.sourceRefs.length,
          0,
        ),
        missingReferences: claims.reduce(
          (total, claim) => total + claim.missingSourceRefs.length,
          0,
        ),
        unusedSources: sources.filter((source) => source.status === "unused")
          .length,
        duplicateReferences: sources.filter(
          (source) => source.status === "duplicate_ref",
        ).length,
      },
      sources,
      claims,
    };
  }

  async listAudit(
    documentType: ContentKind,
    documentId: string,
    limit = 100,
  ): Promise<readonly EditorialAuditEvent[]> {
    return this.repository.listAudit(
      documentType,
      documentId,
      Math.max(1, Math.min(limit, 250)),
    );
  }

  async exportAudit(
    documentType: ContentKind,
    documentId: string,
    limit = 250,
    now = new Date(),
  ): Promise<AuditExport> {
    return {
      format: "amanor-editorial-audit-v2",
      generatedAt: now,
      documentType,
      documentId,
      events: await this.listAudit(documentType, documentId, limit),
      integrity: await this.verifyAuditIntegrity(documentType, documentId),
    };
  }

  async verifyAuditIntegrity(
    documentType: ContentKind,
    documentId: string,
  ): Promise<EditorialAuditIntegrity> {
    return this.repository.verifyAuditIntegrity(documentType, documentId);
  }

  async publicProjection(
    documentType: ContentKind,
    documentId: string,
    locale: Locale,
  ): Promise<Readonly<{
    publication: Publication;
    payload: unknown;
    translation: TranslationSummary;
  }> | null> {
    const result = await this.repository.findPublished(
      documentType,
      documentId,
      locale,
    );
    return result
      ? {
          publication: result.publication,
          payload: projectPublicLocale(result.payload, locale),
          translation: summarizeTranslation(result.payload, locale),
        }
      : null;
  }

  async listPublicSources(
    locale: Locale,
    limit = 25,
    cursor?: string,
    query?: string,
  ): Promise<PublicSourcePage> {
    return this.repository.listPublicSources(
      locale,
      Math.max(1, Math.min(limit, 50)),
      cursor,
      query,
    );
  }

  async listPublicAtlas(
    locale: Locale,
  ): Promise<
    Readonly<{ items: readonly unknown[]; translation: TranslationSummary }>
  > {
    const rows = await this.repository.listPublicAtlas(locale);
    const items = rows.map((row) => projectPublicLocale(row.payload, locale));
    const summaries = rows.map((row) =>
      summarizeTranslation(row.payload, locale),
    );
    const sourceUpdatedAt = summaries
      .map((item) => item.sourceUpdatedAt)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      items,
      translation: {
        stale: summaries.some((item) => item.stale),
        ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
      },
    };
  }

  async listPublicArchive(
    locale: Locale,
    query?: string,
    type?: "speech" | "interview" | "panel" | "article" | "broadcast",
  ): Promise<
    Readonly<{
      items: readonly unknown[];
      translation: TranslationSummary;
    }>
  > {
    const rows = await this.repository.listPublicArchive(locale, query, type);
    const summaries = rows.map((row) =>
      summarizeTranslation(row.payload, locale),
    );
    const sourceUpdatedAt = summaries
      .map((item) => item.sourceUpdatedAt)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      items: rows.map((row) => {
        const payload = projectPublicLocale(row.payload, locale);
        return {
          documentId: row.documentId,
          publishedAt: row.publishedAt,
          ...(payload && typeof payload === "object" && !Array.isArray(payload)
            ? payload
            : {}),
        };
      }),
      translation: {
        stale: summaries.some((item) => item.stale),
        ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
      },
    };
  }

  async listPublicSpeakingThemes(locale: Locale): Promise<
    Readonly<{
      items: readonly unknown[];
      translation: TranslationSummary;
    }>
  > {
    const rows = await this.repository.listPublicSpeakingThemes(locale);
    const summaries = rows.map((row) =>
      summarizeTranslation(row.payload, locale),
    );
    const sourceUpdatedAt = summaries
      .map((item) => item.sourceUpdatedAt)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      items: rows.map((row) => {
        const payload = projectPublicLocale(row.payload, locale);
        return {
          documentId: row.documentId,
          publishedAt: row.publishedAt,
          ...(payload && typeof payload === "object" && !Array.isArray(payload)
            ? payload
            : {}),
        };
      }),
      translation: {
        stale: summaries.some((item) => item.stale),
        ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
      },
    };
  }

  async latestPublicSignal(locale: Locale): Promise<Readonly<{
    documentId: string;
    payload: unknown;
    translation: TranslationSummary;
  }> | null> {
    const row = await this.repository.latestPublicSignal(locale);
    if (!row) return null;
    const projected = projectPublicLocale(row.payload, locale);
    return {
      documentId: row.documentId,
      ...(projected &&
      typeof projected === "object" &&
      !Array.isArray(projected)
        ? { payload: projected }
        : { payload: {} }),
      translation: summarizeTranslation(row.payload, locale),
    };
  }

  async listPublicSignals(locale: Locale): Promise<
    Readonly<{
      items: readonly unknown[];
      translation: TranslationSummary;
    }>
  > {
    const rows = await this.repository.listPublicSignals(locale);
    const summaries = rows.map((row) =>
      summarizeTranslation(row.payload, locale),
    );
    const sourceUpdatedAt = summaries
      .map((item) => item.sourceUpdatedAt)
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    return {
      items: rows.map((row) => {
        const payload = projectPublicLocale(row.payload, locale);
        return {
          documentId: row.documentId,
          ...(payload && typeof payload === "object" && !Array.isArray(payload)
            ? payload
            : {}),
        };
      }),
      translation: {
        stale: summaries.some((item) => item.stale),
        ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
      },
    };
  }

  async transition(
    documentType: ContentKind,
    documentId: string,
    versionNumber: number,
    action: WorkflowAction,
    actor: EditorialActor,
    options: Readonly<{ policySensitive?: boolean; scheduledFor?: Date }>,
  ): Promise<ContentVersion> {
    const current = await this.requiredVersion(
      documentType,
      documentId,
      versionNumber,
    );
    if (action === "submit") {
      this.assertDraftPermission(documentType, actor);
      if (current.authorId !== actor.id)
        throw new Error("Authors may submit only their own content version");
    } else if (action === "request_changes" || action === "approve") {
      this.assertPermission(actor, "content:review", action);
    } else {
      this.assertPermission(actor, "content:publish", action);
    }
    const next = transitionContent(current, action, actor, options);
    if (
      !(await this.repository.replaceVersion(current, next, {
        actorId: actor.id,
        action,
        metadata: { state: next.state },
      }))
    )
      throw new Error("Content changed concurrently; reload and retry");
    return next;
  }

  async publish(
    documentType: ContentKind,
    documentId: string,
    versionNumber: number,
    locale: Locale,
    actor: EditorialActor,
    now = new Date(),
  ): Promise<Publication> {
    this.assertPermission(actor, "content:publish", "publish content");
    const version = await this.requiredVersion(
      documentType,
      documentId,
      versionNumber,
    );
    if (
      version.state !== "approved" &&
      version.state !== "scheduled" &&
      version.state !== "published"
    )
      throw new Error("Only approved content can be published");
    if (version.state === "published") {
      const currentLocale = await this.repository.findPublication(
        documentType,
        documentId,
        locale,
      );
      if (currentLocale?.version === versionNumber)
        throw new Error("This version is already published for the locale");
    }
    if (version.scheduledFor && version.scheduledFor > now)
      throw new Error(
        "Scheduled content cannot publish before its scheduled time",
      );
    const validation = validateForPublication(
      documentType,
      version.payload,
      locale,
      {
        authorId: version.authorId,
        ...(version.reviewerId ? { reviewerId: version.reviewerId } : {}),
      },
    );
    if (!validation.valid)
      throw new Error(
        `Publication validation failed: ${validation.errors.join("; ")}`,
      );
    await this.assertPublishedSources(version.payload, locale);
    const mediaReferences = await this.assertPublishedMedia(
      documentType,
      version.payload,
    );
    const publication = {
      documentType,
      documentId,
      locale,
      version: versionNumber,
      publishedAt: now,
    } as const;
    const audit = {
      documentType,
      documentId,
      version: versionNumber,
      actorId: actor.id,
      action: "published",
      metadata: { locale },
      changes: createEditorialDiff(undefined, {
        locale,
        version: versionNumber,
      }),
    } as const;
    await this.repository.publishTransaction({
      publication,
      payload: version.payload,
      audit,
      tags: publicationTags(publication),
      mediaReferences,
    });
    return publication;
  }

  async rollback(
    documentType: ContentKind,
    documentId: string,
    versionNumber: number,
    locale: Locale,
    actor: EditorialActor,
    now = new Date(),
  ): Promise<Publication> {
    this.assertPermission(actor, "content:publish", "rollback content");
    const target = await this.requiredVersion(
      documentType,
      documentId,
      versionNumber,
    );
    if (target.state !== "published" && target.state !== "superseded")
      throw new Error("Only a previously published version can be restored");
    const current = await this.repository.findPublication(
      documentType,
      documentId,
      locale,
    );
    if (!current)
      throw new Error("No current publication exists for this locale");
    if (current.version === versionNumber)
      throw new Error("The requested version is already published");
    const validation = validateForPublication(
      documentType,
      target.payload,
      locale,
      {
        authorId: target.authorId,
        ...(target.reviewerId ? { reviewerId: target.reviewerId } : {}),
      },
    );
    if (!validation.valid)
      throw new Error(
        `Rollback validation failed: ${validation.errors.join("; ")}`,
      );
    await this.assertPublishedSources(target.payload, locale);
    const mediaReferences = await this.assertPublishedMedia(
      documentType,
      target.payload,
    );
    const publication = {
      documentType,
      documentId,
      locale,
      version: versionNumber,
      publishedAt: now,
    } as const;
    const audit = {
      documentType,
      documentId,
      version: versionNumber,
      actorId: actor.id,
      action: "rolled_back",
      metadata: {
        locale,
        fromVersion: current.version,
        toVersion: versionNumber,
      },
      changes: createEditorialDiff(
        { locale, version: current.version },
        { locale, version: versionNumber },
      ),
    } as const;
    await this.repository.publishTransaction({
      publication,
      payload: target.payload,
      audit,
      tags: publicationTags(publication),
      mediaReferences,
      idempotencyKey: `rollback:${documentType}:${documentId}:${locale}:${versionNumber}:${now.getTime()}`,
    });
    return publication;
  }

  async unpublish(
    documentType: ContentKind,
    documentId: string,
    locale: Locale,
    actor: EditorialActor,
    now = new Date(),
  ): Promise<Unpublication> {
    this.assertPermission(actor, "content:publish", "unpublish content");
    if (documentType === "source") {
      const current = await this.repository.findPublished(
        documentType,
        documentId,
        locale,
      );
      const reference =
        current?.payload && typeof current.payload === "object"
          ? (current.payload as { ref?: unknown }).ref
          : undefined;
      if (typeof reference === "string") {
        const dependents =
          await this.repository.findPublishedSourceDependents(reference);
        if (dependents.length > 0)
          throw new Error(
            `Source cannot be unpublished while referenced by published content: ${dependents.join(", ")}`,
          );
      }
    }
    return this.repository.unpublishTransaction({
      documentType,
      documentId,
      locale,
      actorId: actor.id,
      now,
      tags: publicationTags({
        documentType,
        documentId,
        locale,
        version: 1,
        publishedAt: now,
      }),
    });
  }

  private async requiredVersion(
    documentType: ContentKind,
    documentId: string,
    version: number,
  ): Promise<ContentVersion> {
    const found = await this.repository.findVersion(
      documentType,
      documentId,
      version,
    );
    if (!found) throw new Error("Content version was not found");
    return found;
  }

  private assertDraftPermission(
    documentType: ContentKind,
    actor: EditorialActor,
  ): void {
    if (documentType === "identity") {
      this.assertPermission(actor, "identity:manage", "edit identity content");
      return;
    }
    if (documentType === "scholar") {
      this.assertPermission(actor, "legacy:manage", "edit scholar content");
      return;
    }
    if (deskContentKinds.has(documentType)) {
      this.assertPermission(actor, "desk:operate", "edit Desk content");
      return;
    }
    if (
      !hasPermission(actor.roles, "content:write") &&
      !hasPermission(actor.roles, "content:translate")
    )
      throw new Error(
        "Content write or translation permission is required to create a draft",
      );
  }

  private assertPermission(
    actor: EditorialActor,
    permission: Permission,
    operation: string,
  ): void {
    if (!hasPermission(actor.roles, permission))
      throw new Error(`${permission} permission is required to ${operation}`);
  }

  private async assertPublishedSources(
    payload: unknown,
    locale: Locale,
  ): Promise<void> {
    const references = collectSourceReferences(payload);
    if (references.length === 0) return;
    const missing = await this.repository.findMissingPublishedSourceRefs(
      references,
      locale,
    );
    if (missing.length > 0)
      throw new Error(
        `Publication validation failed: source references are not published in ${locale}: ${missing.join(", ")}`,
      );
  }

  private async assertPublishedMedia(
    documentType: ContentKind,
    payload: unknown,
  ): Promise<readonly GovernedMediaReference[]> {
    const references = collectGovernedMediaReferences(documentType, payload);
    if (references.length === 0) return references;
    if (!this.mediaReferences)
      throw new Error(
        "Publication validation failed: governed media validation is unavailable",
      );
    try {
      await this.mediaReferences.assertPublishable(references);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "governed media is invalid";
      throw new Error(`Publication validation failed: ${message}`);
    }
    return references;
  }
}
