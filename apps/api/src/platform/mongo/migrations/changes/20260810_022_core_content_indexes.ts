import type { Db } from "mongodb";
import type { MongoMigration } from "../types";

async function dropIndexIfPresent(
  db: Db,
  collection: string,
  name: string,
): Promise<void> {
  try {
    await db.collection(collection).dropIndex(name);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/index not found|ns not found/iu.test(error.message)
    )
      throw error;
  }
}

export const coreContentIndexesMigration: MongoMigration = {
  id: "20260810_022_core_content_indexes",
  description:
    "Align structured Atlas, Speaking, Signal, Archive and Source indexes",
  async up(db) {
    for (const [collection, names] of [
      ["atlas_nodes", ["slug_1", "location_2dsphere"]],
      ["archive_items", ["slug_1"]],
      ["speaking_themes", ["slug_1"]],
      ["signals", ["slug_1"]],
      ["sources", ["ref_1"]],
    ] as const) {
      for (const name of names) await dropIndexIfPresent(db, collection, name);
      await db
        .collection(collection)
        .createIndex({ stableId: 1 }, { unique: true, name: "stableId_1" });
    }

    for (const collection of [
      "atlas_nodes",
      "archive_items",
      "speaking_themes",
      "signals",
    ] as const) {
      await db
        .collection(collection)
        .createIndex({ "data.slug": 1 }, { unique: true, name: "data_slug_1" });
    }
    await db
      .collection("sources")
      .createIndex({ "data.ref": 1 }, { unique: true, name: "data_ref_1" });

    await db
      .collection("atlas_nodes")
      .createIndex(
        { "data.startDate": 1, "data.endDate": 1, "data.era": 1 },
        { name: "atlas_timeline_era" },
      );
    await db
      .collection("archive_items")
      .createIndex(
        { "data.type": 1, "data.date": -1 },
        { name: "archive_type_date" },
      );
    await db
      .collection("speaking_themes")
      .createIndex(
        { "data.featured": -1, "data.slug": 1 },
        { name: "speaking_featured_slug" },
      );
    await db
      .collection("signals")
      .createIndex(
        { "data.publishedAt": -1, "data.slug": 1 },
        { name: "signal_publishedAt_slug" },
      );
  },
};
