import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import type { ClientSession, Db } from "mongodb";
import {
  calculateEditorialAuditHash,
  createEditorialAuditEvent,
  createEditorialDiff,
  type EditorialAuditEvent,
  type EditorialAuditInput,
} from "../application/audit";
import type { ContentKind } from "../domain/types";
import type {
  GovernedMediaReference,
  MediaAsset,
} from "../../media/domain/media";
import { collectSourceReferences } from "../domain/publication-validation";
import type {
  ContentDocumentPage,
  ContentVersion,
  EditorialAuditIntegrity,
  Publication,
  Unpublication,
} from "../domain/workflow";
import {
  materializeStructuredPublication,
  removeStructuredPublicationLocale,
  verifyStructuredPublicationProjections,
  type StructuredProjectionIntegrity,
} from "./structured-publication-projection";

type VersionDocument = ContentVersion & { createdAt: Date; updatedAt: Date };
export type PublicSourcePage = Readonly<{
  items: readonly Readonly<{
    ref: string;
    title: string;
    publisher: string;
    url?: string;
    accessedAt: Date;
    type: "cv" | "press" | "official" | "firstParty";
  }>[];
  nextCursor?: string;
}>;
export type PublishedAtlasPayload = Readonly<{ payload: unknown }>;
export type PublishedArchivePayload = Readonly<{
  documentId: string;
  publishedAt: Date;
  payload: unknown;
}>;
export type PublishedSpeakingThemePayload = PublishedArchivePayload;
export type PublishedSignalPayload = PublishedArchivePayload;
export type PublishedSourceAuditRow = Readonly<{
  documentType: ContentKind;
  documentId: string;
  locale: "en-GB" | "fr-FR";
  version: number;
  payload: unknown;
}>;

@Injectable()
export class CmsRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private database(): Db {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db;
  }

  async createDraft(input: {
    documentType: ContentKind;
    documentId: string;
    authorId: string;
    payload: unknown;
  }): Promise<ContentVersion> {
    let draft: VersionDocument | undefined;
    await this.connection.transaction(async (session) => {
      const versions =
        this.database().collection<VersionDocument>("content_versions");
      const latest = await versions.findOne(
        { documentType: input.documentType, documentId: input.documentId },
        { sort: { version: -1 }, session },
      );
      const now = new Date();
      draft = {
        ...input,
        version: (latest?.version ?? 0) + 1,
        state: "draft",
        createdAt: now,
        updatedAt: now,
      };
      await versions.insertOne(draft, { session });
      await this.appendChainedAudit(
        {
          documentType: input.documentType,
          documentId: input.documentId,
          version: draft.version,
          actorId: input.authorId,
          action: latest ? "edited" : "created",
          metadata: { state: "draft" },
          changes: createEditorialDiff(latest?.payload, input.payload),
        },
        session,
        now,
      );
    });
    if (!draft) throw new Error("Draft transaction did not complete");
    return draft;
  }

  async verifyStructuredProjections(): Promise<StructuredProjectionIntegrity> {
    return verifyStructuredPublicationProjections(this.database());
  }

  async findVersion(
    documentType: ContentKind,
    documentId: string,
    version: number,
  ): Promise<ContentVersion | null> {
    return this.database()
      .collection<VersionDocument>("content_versions")
      .findOne(
        { documentType, documentId, version },
        { projection: { _id: 0 } },
      );
  }

  async findLatestVersion(
    documentType: ContentKind,
    documentId: string,
  ): Promise<ContentVersion | null> {
    return this.database()
      .collection<VersionDocument>("content_versions")
      .findOne(
        { documentType, documentId },
        { sort: { version: -1 }, projection: { _id: 0 } },
      );
  }

  async listVersions(
    documentType: ContentKind,
    documentId: string,
  ): Promise<readonly VersionDocument[]> {
    return this.database()
      .collection<VersionDocument>("content_versions")
      .find({ documentType, documentId }, { projection: { _id: 0 } })
      .sort({ version: -1 })
      .toArray();
  }

  async listDocuments(
    documentType: ContentKind,
    limit: number,
    cursor?: string,
  ): Promise<ContentDocumentPage> {
    const rows = await this.database()
      .collection<VersionDocument>("content_versions")
      .aggregate<{
        documentType: ContentKind;
        documentId: string;
        latestVersion: number;
        state: ContentVersion["state"];
        updatedAt: Date;
      }>([
        {
          $match: {
            documentType,
            ...(cursor ? { documentId: { $gt: cursor } } : {}),
          },
        },
        { $sort: { documentId: 1, version: -1 } },
        {
          $group: {
            _id: "$documentId",
            documentType: { $first: "$documentType" },
            documentId: { $first: "$documentId" },
            latestVersion: { $first: "$version" },
            state: { $first: "$state" },
            updatedAt: { $first: "$updatedAt" },
          },
        },
        { $sort: { documentId: 1 } },
        { $limit: limit + 1 },
        { $project: { _id: 0 } },
      ])
      .toArray();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      ...(hasMore ? { nextCursor: items[items.length - 1]!.documentId } : {}),
    };
  }

  async replaceVersion(
    expected: ContentVersion,
    next: ContentVersion,
    audit: Pick<EditorialAuditInput, "actorId" | "action" | "metadata">,
  ): Promise<boolean> {
    let replaced = false;
    await this.connection.transaction(async (session) => {
      const now = new Date();
      const result = await this.database()
        .collection<VersionDocument>("content_versions")
        .updateOne(
          {
            documentType: expected.documentType,
            documentId: expected.documentId,
            version: expected.version,
            state: expected.state,
          },
          { $set: { ...next, updatedAt: now } },
          { session },
        );
      replaced = result.modifiedCount === 1;
      if (!replaced) return;
      await this.appendChainedAudit(
        {
          documentType: next.documentType,
          documentId: next.documentId,
          version: next.version,
          ...audit,
          changes: createEditorialDiff(expected, next),
        },
        session,
        now,
      );
    });
    return replaced;
  }

  async publishTransaction(input: {
    publication: Publication;
    payload: unknown;
    audit: EditorialAuditInput;
    tags: readonly string[];
    idempotencyKey?: string;
    mediaReferences?: readonly GovernedMediaReference[];
  }): Promise<void> {
    await this.connection.transaction(async (session) => {
      const database = this.database();
      await this.assertGovernedMediaReferences(
        input.mediaReferences ?? [],
        session,
      );
      const previous = await database
        .collection<Publication>("publications")
        .findOne(
          {
            documentType: input.publication.documentType,
            documentId: input.publication.documentId,
            locale: input.publication.locale,
          },
          { session },
        );
      await database.collection<Publication>("publications").updateOne(
        {
          documentType: input.publication.documentType,
          documentId: input.publication.documentId,
          locale: input.publication.locale,
        },
        { $set: input.publication },
        { upsert: true, session },
      );
      await materializeStructuredPublication(
        database,
        input.publication,
        input.payload,
        session,
      );
      await this.appendChainedAudit(input.audit, session, new Date());
      await database.collection("outbox_jobs").updateOne(
        {
          idempotencyKey:
            input.idempotencyKey ??
            `publish:${input.publication.documentType}:${input.publication.documentId}:${input.publication.locale}:${input.publication.version}`,
        },
        {
          $setOnInsert: {
            tags: input.tags,
            status: "pending",
            availableAt: new Date(),
            createdAt: new Date(),
          },
        },
        { upsert: true, session },
      );
      await database.collection<VersionDocument>("content_versions").updateOne(
        {
          documentType: input.publication.documentType,
          documentId: input.publication.documentId,
          version: input.publication.version,
        },
        { $set: { state: "published", updatedAt: new Date() } },
        { session },
      );
      if (previous && previous.version !== input.publication.version) {
        const remainingLocales = await database
          .collection<Publication>("publications")
          .countDocuments(
            {
              documentType: previous.documentType,
              documentId: previous.documentId,
              version: previous.version,
            },
            { session },
          );
        if (remainingLocales === 0) {
          await database
            .collection<VersionDocument>("content_versions")
            .updateOne(
              {
                documentType: previous.documentType,
                documentId: previous.documentId,
                version: previous.version,
                state: "published",
              },
              { $set: { state: "superseded", updatedAt: new Date() } },
              { session },
            );
        }
      }
    });
  }

  private async assertGovernedMediaReferences(
    references: readonly GovernedMediaReference[],
    session: ClientSession,
  ): Promise<void> {
    if (references.length === 0) return;
    const database = this.database();
    const assetIds = [
      ...new Set(references.map((item) => item.assetId)),
    ].sort();
    for (const assetId of assetIds)
      await database
        .collection<{
          _id: string;
          epoch: number;
          updatedAt: Date;
        }>("media_reference_locks")
        .updateOne(
          { _id: assetId },
          { $inc: { epoch: 1 }, $set: { updatedAt: new Date() } },
          { upsert: true, session },
        );
    const assets = await database
      .collection<MediaAsset>("media_assets")
      .find(
        { assetId: { $in: assetIds }, status: "active" },
        { projection: { _id: 0 }, session },
      )
      .toArray();
    const assetsById = new Map(assets.map((asset) => [asset.assetId, asset]));
    for (const reference of references) {
      const asset = assetsById.get(reference.assetId);
      if (!asset)
        throw new Error(`${reference.path}: governed media is not active`);
      if (asset.resourceType !== reference.resourceType)
        throw new Error(
          `${reference.path}: governed media must be ${reference.resourceType}`,
        );
      if (
        reference.folder &&
        !asset.publicId.startsWith(`amanor/${reference.folder}/`)
      )
        throw new Error(
          `${reference.path}: governed media must use the ${reference.folder} folder`,
        );
    }
  }

  async unpublishTransaction(input: {
    documentType: ContentKind;
    documentId: string;
    locale: "en-GB" | "fr-FR";
    actorId: string;
    now: Date;
    tags: readonly string[];
  }): Promise<Unpublication> {
    let result: Unpublication | undefined;
    await this.connection.transaction(async (session) => {
      const database = this.database();
      const publication = await database
        .collection<Publication>("publications")
        .findOne(
          {
            documentType: { $eq: input.documentType },
            documentId: { $eq: input.documentId },
            locale: { $eq: input.locale },
          },
          { session },
        );
      if (!publication)
        throw new Error("No current publication exists for this locale");
      await database.collection("publications").deleteOne(
        {
          documentType: { $eq: input.documentType },
          documentId: { $eq: input.documentId },
          locale: { $eq: input.locale },
          version: { $eq: publication.version },
        },
        { session },
      );
      await removeStructuredPublicationLocale(
        database,
        publication,
        input.now,
        session,
      );
      await this.appendChainedAudit(
        {
          documentType: input.documentType,
          documentId: input.documentId,
          version: publication.version,
          actorId: input.actorId,
          action: "unpublished",
          metadata: { locale: input.locale },
          changes: createEditorialDiff(
            { locale: input.locale, version: publication.version },
            undefined,
          ),
        },
        session,
        input.now,
      );
      await database.collection("outbox_jobs").updateOne(
        {
          idempotencyKey: `unpublish:${input.documentType}:${input.documentId}:${input.locale}:${publication.publishedAt.getTime()}`,
        },
        {
          $setOnInsert: {
            tags: input.tags,
            status: "pending",
            availableAt: input.now,
            createdAt: input.now,
          },
        },
        { upsert: true, session },
      );
      const remaining = await database
        .collection("publications")
        .countDocuments(
          {
            documentType: input.documentType,
            documentId: input.documentId,
            version: publication.version,
          },
          { session },
        );
      if (remaining === 0)
        await database.collection("content_versions").updateOne(
          {
            documentType: input.documentType,
            documentId: input.documentId,
            version: publication.version,
            state: "published",
          },
          { $set: { state: "superseded", updatedAt: input.now } },
          { session },
        );
      result = {
        documentType: input.documentType,
        documentId: input.documentId,
        locale: input.locale,
        version: publication.version,
        unpublishedAt: input.now,
      };
    });
    if (!result) throw new Error("Unpublish transaction did not complete");
    return result;
  }

  async findPublication(
    documentType: ContentKind,
    documentId: string,
    locale: "en-GB" | "fr-FR",
  ): Promise<Publication | null> {
    return this.database()
      .collection<Publication>("publications")
      .findOne(
        {
          documentType: { $eq: documentType },
          documentId: { $eq: documentId },
          locale: { $eq: locale },
        },
        { projection: { _id: 0 } },
      );
  }

  async listAudit(
    documentType: ContentKind,
    documentId: string,
    limit: number,
  ): Promise<readonly EditorialAuditEvent[]> {
    return this.database()
      .collection<EditorialAuditEvent>("editorial_audit")
      .find({ documentType, documentId }, { projection: { _id: 0 } })
      .sort({ sequence: -1 })
      .limit(limit)
      .toArray();
  }

  async verifyAuditIntegrity(
    documentType: ContentKind,
    documentId: string,
    limit = 10_000,
  ): Promise<EditorialAuditIntegrity> {
    const events = await this.database()
      .collection<EditorialAuditEvent>("editorial_audit")
      .find({ documentType, documentId }, { projection: { _id: 0 } })
      .sort({ sequence: 1 })
      .limit(limit + 1)
      .toArray();
    if (events.length > limit)
      return {
        status: "incomplete",
        checkedEvents: limit,
        reason: "Audit chain exceeds the verification limit",
      };
    if (events.length === 0) {
      const versionExists = await this.database()
        .collection("content_versions")
        .findOne({ documentType, documentId }, { projection: { _id: 1 } });
      if (versionExists)
        return {
          status: "invalid",
          checkedEvents: 0,
          reason: "Content exists without an editorial audit chain",
        };
    }
    let previousEventHash: string | undefined;
    for (const [index, event] of events.entries()) {
      if (
        event.sequence !== index + 1 ||
        event.previousEventHash !== previousEventHash ||
        calculateEditorialAuditHash(event) !== event.eventHash
      )
        return {
          status: "invalid",
          checkedEvents: index,
          ...(events.at(-1) ? { headSequence: events.at(-1)!.sequence } : {}),
          reason: `Audit chain failed at sequence ${event.sequence}`,
        };
      previousEventHash = event.eventHash;
    }
    const head = await this.database()
      .collection<{
        sequence: number;
        eventHash: string;
      }>("editorial_audit_heads")
      .findOne({ documentType, documentId });
    if (
      events.length > 0 &&
      (!head ||
        head.sequence !== events.length ||
        head.eventHash !== previousEventHash)
    )
      return {
        status: "invalid",
        checkedEvents: events.length,
        ...(head ? { headSequence: head.sequence } : {}),
        reason: "Audit head does not match the event chain",
      };
    return {
      status: "valid",
      checkedEvents: events.length,
      ...(head ? { headSequence: head.sequence } : {}),
    };
  }

  private async appendChainedAudit(
    input: EditorialAuditInput,
    session: ClientSession,
    now: Date,
  ): Promise<EditorialAuditEvent> {
    const database = this.database();
    const key = {
      documentType: input.documentType as ContentKind,
      documentId: input.documentId,
    };
    const head = await database
      .collection<{
        sequence: number;
        eventHash: string;
      }>("editorial_audit_heads")
      .findOne(key, { session });
    const event = createEditorialAuditEvent(
      {
        ...input,
        sequence: (head?.sequence ?? 0) + 1,
        ...(head?.eventHash ? { previousEventHash: head.eventHash } : {}),
      },
      now,
    );
    if (head) {
      const result = await database
        .collection("editorial_audit_heads")
        .updateOne(
          { ...key, sequence: head.sequence, eventHash: head.eventHash },
          {
            $set: {
              sequence: event.sequence,
              eventHash: event.eventHash,
              updatedAt: now,
            },
          },
          { session },
        );
      if (result.modifiedCount !== 1)
        throw new Error("Editorial audit chain changed concurrently");
    } else {
      await database.collection("editorial_audit_heads").insertOne(
        {
          ...key,
          sequence: event.sequence,
          eventHash: event.eventHash,
          updatedAt: now,
        },
        { session },
      );
    }
    await database
      .collection<EditorialAuditEvent>("editorial_audit")
      .insertOne(event, { session });
    return event;
  }

  async findPublished(
    documentType: ContentKind,
    documentId: string,
    locale: "en-GB" | "fr-FR",
  ): Promise<Readonly<{ publication: Publication; payload: unknown }> | null> {
    const publication = await this.database()
      .collection<Publication>("publications")
      .findOne(
        {
          documentType: { $eq: documentType },
          documentId: { $eq: documentId },
          locale: { $eq: locale },
        },
        { projection: { _id: 0 } },
      );
    if (!publication) return null;
    const version = await this.database()
      .collection<VersionDocument>("content_versions")
      .findOne(
        {
          documentType,
          documentId,
          version: publication.version,
          state: "published",
        },
        { projection: { _id: 0, payload: 1 } },
      );
    return version ? { publication, payload: version.payload } : null;
  }

  async findMissingPublishedSourceRefs(
    references: readonly string[],
    locale: "en-GB" | "fr-FR",
  ): Promise<readonly string[]> {
    const expected = [...new Set(references)].sort();
    if (expected.length === 0) return [];
    const rows = await this.database()
      .collection<Publication>("publications")
      .aggregate<{ ref: string }>([
        { $match: { documentType: "source", locale } },
        {
          $lookup: {
            from: "content_versions",
            let: { documentId: "$documentId", version: "$version" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$documentType", "source"] },
                      { $eq: ["$documentId", "$$documentId"] },
                      { $eq: ["$version", "$$version"] },
                      { $eq: ["$state", "published"] },
                    ],
                  },
                },
              },
              { $match: { "payload.ref": { $in: expected } } },
              { $project: { _id: 0, ref: "$payload.ref" } },
            ],
            as: "source",
          },
        },
        { $unwind: "$source" },
        { $replaceWith: "$source" },
      ])
      .toArray();
    const found = new Set(rows.map((row) => row.ref));
    return expected.filter((reference) => !found.has(reference));
  }

  async findPublishedSourceDependents(
    reference: string,
    limit = 100,
  ): Promise<readonly string[]> {
    const rows = await this.database()
      .collection<Publication>("publications")
      .aggregate<{
        documentType: ContentKind;
        documentId: string;
        payload: unknown;
      }>([
        { $match: { documentType: { $ne: "source" } } },
        {
          $lookup: {
            from: "content_versions",
            let: {
              documentType: "$documentType",
              documentId: "$documentId",
              version: "$version",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$documentType", "$$documentType"] },
                      { $eq: ["$documentId", "$$documentId"] },
                      { $eq: ["$version", "$$version"] },
                      { $eq: ["$state", "published"] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, payload: 1 } },
            ],
            as: "versionDocument",
          },
        },
        { $unwind: "$versionDocument" },
        {
          $project: {
            _id: 0,
            documentType: 1,
            documentId: 1,
            payload: "$versionDocument.payload",
          },
        },
        { $limit: 10_001 },
      ])
      .toArray();
    if (rows.length > 10_000)
      throw new Error(
        "Published source dependency scan exceeded its safe limit",
      );
    return [
      ...new Set(
        rows
          .filter((row) =>
            collectSourceReferences(row.payload).includes(reference),
          )
          .map((row) => `${row.documentType}:${row.documentId}`),
      ),
    ]
      .sort()
      .slice(0, limit);
  }

  async listPublishedForSourceAudit(): Promise<
    readonly PublishedSourceAuditRow[]
  > {
    const rows = await this.database()
      .collection<Publication>("publications")
      .aggregate<PublishedSourceAuditRow>([
        { $sort: { documentType: 1, documentId: 1, locale: 1 } },
        {
          $lookup: {
            from: "content_versions",
            let: {
              documentType: "$documentType",
              documentId: "$documentId",
              version: "$version",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$documentType", "$$documentType"] },
                      { $eq: ["$documentId", "$$documentId"] },
                      { $eq: ["$version", "$$version"] },
                      { $eq: ["$state", "published"] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, payload: 1 } },
            ],
            as: "publishedVersion",
          },
        },
        { $unwind: "$publishedVersion" },
        {
          $project: {
            _id: 0,
            documentType: 1,
            documentId: 1,
            locale: 1,
            version: 1,
            payload: "$publishedVersion.payload",
          },
        },
        { $limit: 10_001 },
      ])
      .toArray();
    if (rows.length > 10_000)
      throw new Error("Published source audit exceeded its 10000 row bound");
    return rows;
  }

  async listPublicSources(
    locale: "en-GB" | "fr-FR",
    limit: number,
    cursor?: string,
    query?: string,
  ): Promise<PublicSourcePage> {
    const escapedQuery = query?.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const rows = await this.database()
      .collection<Publication>("publications")
      .aggregate<{
        documentId: string;
        ref: string;
        title: string;
        publisher: string;
        url?: string;
        accessedAt: Date;
        type: "cv" | "press" | "official" | "firstParty";
      }>([
        {
          $match: {
            documentType: "source",
            locale,
            ...(cursor ? { documentId: { $gt: cursor } } : {}),
          },
        },
        { $sort: { documentId: 1 } },
        {
          $lookup: {
            from: "content_versions",
            let: { documentId: "$documentId", version: "$version" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$documentType", "source"] },
                      { $eq: ["$documentId", "$$documentId"] },
                      { $eq: ["$version", "$$version"] },
                      { $eq: ["$state", "published"] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, payload: 1 } },
            ],
            as: "versionDocument",
          },
        },
        { $unwind: "$versionDocument" },
        ...(escapedQuery
          ? [
              {
                $match: {
                  $or: ["ref", "title", "publisher"].map((field) => ({
                    [`versionDocument.payload.${field}`]: {
                      $regex: escapedQuery,
                      $options: "i",
                    },
                  })),
                },
              },
            ]
          : []),
        { $limit: limit + 1 },
        {
          $project: {
            _id: 0,
            documentId: 1,
            ref: "$versionDocument.payload.ref",
            title: "$versionDocument.payload.title",
            publisher: "$versionDocument.payload.publisher",
            url: "$versionDocument.payload.url",
            accessedAt: "$versionDocument.payload.accessedAt",
            type: "$versionDocument.payload.type",
          },
        },
      ])
      .toArray();
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: pageRows.map((row) => ({
        ref: row.ref,
        title: row.title,
        publisher: row.publisher,
        ...(row.url ? { url: row.url } : {}),
        accessedAt: row.accessedAt,
        type: row.type,
      })),
      ...(hasMore
        ? { nextCursor: pageRows[pageRows.length - 1]!.documentId }
        : {}),
    };
  }

  async listPublicAtlas(
    locale: "en-GB" | "fr-FR",
  ): Promise<readonly PublishedAtlasPayload[]> {
    return this.database()
      .collection<Publication>("publications")
      .aggregate<PublishedAtlasPayload>([
        { $match: { documentType: "atlasNode", locale } },
        { $sort: { documentId: 1 } },
        { $limit: 60 },
        {
          $lookup: {
            from: "content_versions",
            let: { documentId: "$documentId", version: "$version" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$documentType", "atlasNode"] },
                      { $eq: ["$documentId", "$$documentId"] },
                      { $eq: ["$version", "$$version"] },
                      { $eq: ["$state", "published"] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, payload: 1 } },
            ],
            as: "versionDocument",
          },
        },
        { $unwind: "$versionDocument" },
        { $project: { _id: 0, payload: "$versionDocument.payload" } },
      ])
      .toArray();
  }

  async listPublicArchive(
    locale: "en-GB" | "fr-FR",
    query?: string,
    type?: "speech" | "interview" | "panel" | "article" | "broadcast",
  ): Promise<readonly PublishedArchivePayload[]> {
    const escapedQuery = query?.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return this.database()
      .collection<Publication>("publications")
      .aggregate<PublishedArchivePayload>([
        { $match: { documentType: "archiveItem", locale } },
        { $sort: { publishedAt: -1, documentId: 1 } },
        {
          $lookup: {
            from: "content_versions",
            let: { documentId: "$documentId", version: "$version" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$documentType", "archiveItem"] },
                      { $eq: ["$documentId", "$$documentId"] },
                      { $eq: ["$version", "$$version"] },
                      { $eq: ["$state", "published"] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, payload: 1 } },
            ],
            as: "versionDocument",
          },
        },
        { $unwind: "$versionDocument" },
        ...(type || escapedQuery
          ? [
              {
                $match: {
                  ...(type ? { "versionDocument.payload.type": type } : {}),
                  ...(escapedQuery
                    ? {
                        $or: [
                          `versionDocument.payload.title.${locale}`,
                          "versionDocument.payload.venue",
                          "versionDocument.payload.city",
                          "versionDocument.payload.country",
                          `versionDocument.payload.transcript.${locale}`,
                          `versionDocument.payload.transcriptSegments.text.${locale}`,
                        ].map((field) => ({
                          [field]: { $regex: escapedQuery, $options: "i" },
                        })),
                      }
                    : {}),
                },
              },
            ]
          : []),
        { $limit: 50 },
        {
          $project: {
            _id: 0,
            documentId: 1,
            publishedAt: 1,
            payload: "$versionDocument.payload",
          },
        },
      ])
      .toArray();
  }

  async listPublicSpeakingThemes(
    locale: "en-GB" | "fr-FR",
  ): Promise<readonly PublishedSpeakingThemePayload[]> {
    return this.database()
      .collection<Publication>("publications")
      .aggregate<PublishedSpeakingThemePayload>([
        { $match: { documentType: "speakingTheme", locale } },
        { $sort: { publishedAt: -1, documentId: 1 } },
        { $limit: 50 },
        {
          $lookup: {
            from: "content_versions",
            let: { documentId: "$documentId", version: "$version" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$documentType", "speakingTheme"] },
                      { $eq: ["$documentId", "$$documentId"] },
                      { $eq: ["$version", "$$version"] },
                      { $eq: ["$state", "published"] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, payload: 1 } },
            ],
            as: "versionDocument",
          },
        },
        { $unwind: "$versionDocument" },
        {
          $project: {
            _id: 0,
            documentId: 1,
            publishedAt: 1,
            payload: "$versionDocument.payload",
          },
        },
      ])
      .toArray();
  }

  async latestPublicSignal(
    locale: "en-GB" | "fr-FR",
  ): Promise<PublishedSignalPayload | null> {
    const rows = await this.database()
      .collection<Publication>("publications")
      .aggregate<PublishedSignalPayload>([
        { $match: { documentType: "signal", locale } },
        {
          $lookup: {
            from: "content_versions",
            let: { documentId: "$documentId", version: "$version" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$documentType", "signal"] },
                      { $eq: ["$documentId", "$$documentId"] },
                      { $eq: ["$version", "$$version"] },
                      { $eq: ["$state", "published"] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, payload: 1 } },
            ],
            as: "versionDocument",
          },
        },
        { $unwind: "$versionDocument" },
        {
          $match: {
            "versionDocument.payload.sourceRefs.0": { $exists: true },
          },
        },
        {
          $sort: {
            "versionDocument.payload.publishedAt": -1,
            documentId: 1,
          },
        },
        { $limit: 1 },
        {
          $project: {
            _id: 0,
            documentId: 1,
            publishedAt: 1,
            payload: "$versionDocument.payload",
          },
        },
      ])
      .toArray();
    return rows[0] ?? null;
  }

  async listPublicSignals(
    locale: "en-GB" | "fr-FR",
  ): Promise<readonly PublishedSignalPayload[]> {
    return this.database()
      .collection<Publication>("publications")
      .aggregate<PublishedSignalPayload>([
        { $match: { documentType: "signal", locale } },
        {
          $lookup: {
            from: "content_versions",
            let: { documentId: "$documentId", version: "$version" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$documentType", "signal"] },
                      { $eq: ["$documentId", "$$documentId"] },
                      { $eq: ["$version", "$$version"] },
                      { $eq: ["$state", "published"] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, payload: 1 } },
            ],
            as: "versionDocument",
          },
        },
        { $unwind: "$versionDocument" },
        {
          $match: { "versionDocument.payload.sourceRefs.0": { $exists: true } },
        },
        {
          $sort: {
            "versionDocument.payload.publishedAt": -1,
            documentId: 1,
          },
        },
        { $limit: 50 },
        {
          $project: {
            _id: 0,
            documentId: 1,
            publishedAt: 1,
            payload: "$versionDocument.payload",
          },
        },
      ])
      .toArray();
  }
}
