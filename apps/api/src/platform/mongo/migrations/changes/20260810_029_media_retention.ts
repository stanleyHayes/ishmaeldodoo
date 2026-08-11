import type { MongoMigration } from "../types";

export const mediaRetentionMigration: MongoMigration = {
  id: "20260810_029_media_retention",
  description: "Index governed media retention disposal scans",
  async up(db) {
    await db.collection("media_assets").createIndex(
      {
        status: 1,
        retentionPolicy: 1,
        retainUntil: 1,
        legalHold: 1,
        "retention.retryAt": 1,
        "retention.processingAt": 1,
        assetId: 1,
      },
      { name: "media_retention_scan" },
    );
  },
};
