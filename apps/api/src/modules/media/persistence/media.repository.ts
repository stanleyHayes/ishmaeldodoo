import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import type { ClientSession, Collection } from "mongodb";
import type { MediaAsset } from "../domain/media";
import type {
  MediaAssetListQuery,
  MediaAssetPage,
  MediaMetadataUpdate,
} from "../domain/media";
import type { Filter } from "mongodb";

type MediaCursor = Readonly<{ createdAt: string; assetId: string }>;

function containsAssetReference(value: unknown, assetId: string): boolean {
  if (value === assetId) return true;
  if (Array.isArray(value))
    return value.some((item) => containsAssetReference(item, assetId));
  if (value && typeof value === "object" && !(value instanceof Date))
    return Object.values(value).some((item) =>
      containsAssetReference(item, assetId),
    );
  return false;
}

@Injectable()
export class MediaRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private collection(): Collection<MediaAsset> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection<MediaAsset>("media_assets");
  }

  async create(asset: MediaAsset): Promise<void> {
    await this.collection().insertOne(asset);
  }
  async find(assetId: string): Promise<MediaAsset | null> {
    return this.collection().findOne({ assetId }, { projection: { _id: 0 } });
  }
  async findMany(assetIds: readonly string[]): Promise<readonly MediaAsset[]> {
    if (assetIds.length === 0) return [];
    return this.collection()
      .find(
        { assetId: { $in: [...new Set(assetIds)] } },
        { projection: { _id: 0 } },
      )
      .toArray();
  }
  async findPublic(assetId: string): Promise<MediaAsset | null> {
    return this.collection().findOne(
      { assetId, status: "active" },
      { projection: { _id: 0, createdBy: 0, consentReference: 0 } },
    );
  }
  async list(query: MediaAssetListQuery): Promise<MediaAssetPage> {
    const boundary = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const filter: Record<string, unknown> = { status: "active" };
    if (query.assetId) filter.assetId = query.assetId;
    if (query.folder) filter.publicId = { $regex: `^amanor/${query.folder}/` };
    if (query.resourceType) filter.resourceType = query.resourceType;
    if (boundary) {
      const createdAt = new Date(boundary.createdAt);
      filter.$or = [
        { createdAt: { $lt: createdAt } },
        { createdAt, assetId: { $lt: boundary.assetId } },
      ];
    }
    const items = await this.collection()
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: -1, assetId: -1 })
      .limit(query.limit + 1)
      .toArray();
    const page = items.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page,
      ...(items.length > query.limit && last
        ? {
            nextCursor: this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              assetId: last.assetId,
            }),
          }
        : {}),
    };
  }
  async updateMetadata(
    assetId: string,
    metadata: MediaMetadataUpdate,
    actorId: string,
    updatedAt: Date,
  ): Promise<MediaAsset | null> {
    const { consentReference, focalPoint, retainUntil, ...required } = metadata;
    return this.collection().findOneAndUpdate(
      { assetId, status: "active" },
      {
        $set: {
          ...required,
          ...(consentReference ? { consentReference } : {}),
          ...(focalPoint ? { focalPoint } : {}),
          ...(retainUntil ? { retainUntil } : {}),
          updatedBy: actorId,
          updatedAt,
        },
        $unset: {
          ...(consentReference ? {} : { consentReference: "" }),
          ...(focalPoint ? {} : { focalPoint: "" }),
          ...(retainUntil ? {} : { retainUntil: "" }),
        },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
  }
  async isReferencedByPublication(
    assetId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const database = this.connection.db;
    if (!database) throw new Error("MongoDB is not connected");
    const versions = await database
      .collection("publications")
      .aggregate<{ payload: unknown }>(
        [
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
          { $replaceWith: "$publishedVersion" },
          { $limit: 10_001 },
        ],
        session ? { session } : undefined,
      )
      .toArray();
    if (versions.length > 10_000)
      throw new Error("Published media reference review exceeded its bound");
    return versions.some(({ payload }) =>
      containsAssetReference(payload, assetId),
    );
  }

  private async lockReference(
    assetId: string,
    session: ClientSession,
    now: Date,
  ): Promise<void> {
    const database = this.connection.db;
    if (!database) throw new Error("MongoDB is not connected");
    await database
      .collection<{
        _id: string;
        epoch: number;
        updatedAt: Date;
      }>("media_reference_locks")
      .updateOne(
        { _id: assetId },
        { $inc: { epoch: 1 }, $set: { updatedAt: now } },
        { upsert: true, session },
      );
  }

  async claimManualDeletion(
    assetId: string,
    now: Date,
    lockToken: string,
  ): Promise<MediaAsset | null> {
    let claimed: MediaAsset | null = null;
    await this.connection.transaction(async (session) => {
      await this.lockReference(assetId, session, now);
      if (await this.isReferencedByPublication(assetId, session)) return;
      claimed = await this.collection().findOneAndUpdate(
        {
          assetId,
          status: "active",
          legalHold: { $ne: true },
          retentionPolicy: { $ne: "permanent" },
          $or: [
            { retainUntil: { $exists: false } },
            { retainUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            status: "quarantined",
            "retention.lockToken": lockToken,
            "retention.processingAt": now,
          },
        },
        { returnDocument: "after", projection: { _id: 0 }, session },
      );
    });
    return claimed;
  }

  async restoreManualDeletion(
    assetId: string,
    lockToken: string,
  ): Promise<void> {
    await this.collection().updateOne(
      { assetId, status: "quarantined", "retention.lockToken": lockToken },
      {
        $set: { status: "active" },
        $unset: {
          "retention.lockToken": "",
          "retention.processingAt": "",
        },
      },
    );
  }

  async inventory(): Promise<
    Readonly<{
      assets: readonly MediaAsset[];
      publishedAssetIds: ReadonlySet<string>;
    }>
  > {
    const assets = await this.collection()
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1, assetId: -1 })
      .limit(10_001)
      .toArray();
    if (assets.length > 10_000)
      throw new Error("Media inventory exceeded its 10000 asset bound");
    const database = this.connection.db;
    if (!database) throw new Error("MongoDB is not connected");
    const versions = await database
      .collection("publications")
      .aggregate<{ payload: unknown }>([
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
        { $replaceWith: "$publishedVersion" },
        { $limit: 10_001 },
      ])
      .toArray();
    if (versions.length > 10_000)
      throw new Error("Published media inventory review exceeded its bound");
    return {
      assets,
      publishedAssetIds: new Set(
        assets
          .filter((asset) =>
            versions.some(({ payload }) =>
              containsAssetReference(payload, asset.assetId),
            ),
          )
          .map((asset) => asset.assetId),
      ),
    };
  }
  async markDeleted(assetId: string, deletedAt: Date): Promise<boolean> {
    const result = await this.collection().updateOne(
      { assetId, status: "active" },
      { $set: { status: "deleted", deletedAt } },
    );
    return result.modifiedCount === 1;
  }

  async nextRetentionCandidate(
    now: Date,
    staleBefore: Date,
  ): Promise<MediaAsset | null> {
    const retryable: Filter<MediaAsset> = {
      retentionPolicy: "expires",
      retainUntil: { $lte: now },
      legalHold: { $ne: true },
      $or: [
        {
          status: "active",
          $and: [
            {
              $or: [
                { "retention.retryAt": { $exists: false } },
                { "retention.retryAt": { $lte: now } },
              ],
            },
            { "retention.lockToken": { $exists: false } },
          ],
        },
        {
          status: "quarantined",
          $or: [
            { "retention.retryAt": { $lte: now } },
            { "retention.processingAt": { $lte: staleBefore } },
          ],
        },
      ],
    };
    return this.collection().findOne(retryable, {
      projection: { _id: 0 },
      sort: { retainUntil: 1, assetId: 1 },
    });
  }

  async deferReferencedRetention(
    assetId: string,
    now: Date,
    retryAt: Date,
  ): Promise<void> {
    await this.collection().updateOne(
      { assetId, status: { $in: ["active", "quarantined"] } },
      {
        $set: {
          status: "active",
          "retention.blockedByPublicationAt": now,
          "retention.retryAt": retryAt,
        },
        $unset: {
          "retention.processingAt": "",
          "retention.lockToken": "",
          "retention.failedAt": "",
          "retention.lastError": "",
        },
      },
    );
  }

  async claimRetention(
    assetId: string,
    now: Date,
    staleBefore: Date,
    lockToken: string,
  ): Promise<MediaAsset | null> {
    return this.collection().findOneAndUpdate(
      {
        assetId,
        retentionPolicy: "expires",
        retainUntil: { $lte: now },
        legalHold: { $ne: true },
        $or: [
          {
            status: "active",
            "retention.lockToken": { $exists: false },
            $or: [
              { "retention.retryAt": { $exists: false } },
              { "retention.retryAt": { $lte: now } },
            ],
          },
          {
            status: "quarantined",
            $or: [
              { "retention.retryAt": { $lte: now } },
              { "retention.processingAt": { $lte: staleBefore } },
            ],
          },
        ],
      },
      {
        $set: {
          status: "quarantined",
          "retention.processingAt": now,
          "retention.lockToken": lockToken,
        },
        $inc: { "retention.attempts": 1 },
        $unset: {
          "retention.retryAt": "",
          "retention.failedAt": "",
          "retention.lastError": "",
          "retention.blockedByPublicationAt": "",
        },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
  }

  async claimRetentionIfUnreferenced(
    assetId: string,
    now: Date,
    staleBefore: Date,
    lockToken: string,
    referencedRetryAt: Date,
  ): Promise<MediaAsset | "referenced" | null> {
    let result: MediaAsset | "referenced" | null = null;
    await this.connection.transaction(async (session) => {
      await this.lockReference(assetId, session, now);
      if (await this.isReferencedByPublication(assetId, session)) {
        await this.collection().updateOne(
          { assetId, status: { $in: ["active", "quarantined"] } },
          {
            $set: {
              status: "active",
              "retention.blockedByPublicationAt": now,
              "retention.retryAt": referencedRetryAt,
            },
            $unset: {
              "retention.processingAt": "",
              "retention.lockToken": "",
              "retention.failedAt": "",
              "retention.lastError": "",
            },
          },
          { session },
        );
        result = "referenced";
        return;
      }
      result = await this.collection().findOneAndUpdate(
        {
          assetId,
          retentionPolicy: "expires",
          retainUntil: { $lte: now },
          legalHold: { $ne: true },
          $or: [
            {
              status: "active",
              "retention.lockToken": { $exists: false },
              $or: [
                { "retention.retryAt": { $exists: false } },
                { "retention.retryAt": { $lte: now } },
              ],
            },
            {
              status: "quarantined",
              $or: [
                { "retention.retryAt": { $lte: now } },
                { "retention.processingAt": { $lte: staleBefore } },
              ],
            },
          ],
        },
        {
          $set: {
            status: "quarantined",
            "retention.processingAt": now,
            "retention.lockToken": lockToken,
          },
          $inc: { "retention.attempts": 1 },
          $unset: {
            "retention.retryAt": "",
            "retention.failedAt": "",
            "retention.lastError": "",
            "retention.blockedByPublicationAt": "",
          },
        },
        { returnDocument: "after", projection: { _id: 0 }, session },
      );
    });
    return result;
  }

  async completeRetention(
    assetId: string,
    lockToken: string,
    deletedAt: Date,
  ): Promise<boolean> {
    const result = await this.collection().updateOne(
      {
        assetId,
        status: "quarantined",
        "retention.lockToken": lockToken,
      },
      {
        $set: { status: "deleted", deletedAt },
        $unset: {
          secureUrl: "",
          "retention.processingAt": "",
          "retention.lockToken": "",
          "retention.retryAt": "",
          "retention.failedAt": "",
          "retention.lastError": "",
        },
      },
    );
    return result.modifiedCount === 1;
  }

  async failRetention(
    assetId: string,
    lockToken: string,
    failedAt: Date,
    retryAt: Date,
    lastError: string,
  ): Promise<void> {
    await this.collection().updateOne(
      {
        assetId,
        status: "quarantined",
        "retention.lockToken": lockToken,
      },
      {
        $set: {
          "retention.failedAt": failedAt,
          "retention.retryAt": retryAt,
          "retention.lastError": lastError.slice(0, 160),
        },
        $unset: {
          "retention.processingAt": "",
          "retention.lockToken": "",
        },
      },
    );
  }

  private encodeCursor(cursor: MediaCursor): string {
    return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
  }

  private decodeCursor(value: string): MediaCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      ) as Partial<MediaCursor>;
      if (
        typeof parsed.createdAt !== "string" ||
        Number.isNaN(Date.parse(parsed.createdAt)) ||
        typeof parsed.assetId !== "string" ||
        !/^[a-f0-9-]{36}$/u.test(parsed.assetId)
      )
        throw new Error("invalid");
      return { createdAt: parsed.createdAt, assetId: parsed.assetId };
    } catch {
      throw new Error("Media library cursor is invalid");
    }
  }
}
