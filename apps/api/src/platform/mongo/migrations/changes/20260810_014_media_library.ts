import type { MongoMigration } from "../types";

export const mediaLibraryMigration: MongoMigration = {
  id: "20260810_014_media_library",
  description:
    "Correct Cloudinary identity uniqueness and add stable media library pagination",
  async up(db) {
    const collection = db.collection("media_assets");
    await collection.updateMany(
      { transformationPolicy: { $exists: false } },
      { $set: { transformationPolicy: "editorial" } },
    );
    await collection.updateMany(
      { retentionPolicy: { $exists: false } },
      { $set: { retentionPolicy: "standard" } },
    );
    await collection.updateMany(
      { legalHold: { $exists: false } },
      { $set: { legalHold: false } },
    );
    await collection
      .dropIndex("cloudinaryPublicId_1_resourceType_1")
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          !/index not found|ns not found/iu.test(error.message)
        )
          throw error;
      });
    await collection.createIndex(
      { publicId: 1, resourceType: 1 },
      { unique: true, name: "publicId_1_resourceType_1" },
    );
    await collection.createIndex(
      { status: 1, createdAt: -1, assetId: -1 },
      { name: "status_1_createdAt_-1_assetId_-1" },
    );
  },
};
