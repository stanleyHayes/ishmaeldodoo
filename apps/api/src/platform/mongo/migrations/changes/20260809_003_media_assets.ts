import type { MongoMigration } from "../types";

export const mediaAssetsMigration: MongoMigration = {
  id: "20260809_003_media_assets",
  description: "Create governed Cloudinary media asset indexes",
  async up(db) {
    await db
      .collection("media_assets")
      .createIndex({ assetId: 1 }, { unique: true });
    await db
      .collection("media_assets")
      .createIndex(
        { cloudinaryPublicId: 1, resourceType: 1 },
        { unique: true },
      );
    await db
      .collection("media_assets")
      .createIndex({ status: 1, createdAt: -1 });
  },
};
