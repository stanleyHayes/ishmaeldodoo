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

export const contentCollectionIndexesMigration: MongoMigration = {
  id: "20260810_021_content_collection_indexes",
  description:
    "Align structured CMS indexes for scholars, Office Hours, Selah, riders, email templates and pages",
  async up(db) {
    await dropIndexIfPresent(db, "pages", "slug_1");
    await dropIndexIfPresent(db, "scholars", "consentStatus_1_cohortYear_-1");

    const collections = [
      "scholars",
      "office_hours_cycles",
      "office_hours_answers",
      "selah_entries",
      "rider_templates",
      "email_templates",
      "pages",
    ] as const;
    for (const collection of collections) {
      await db
        .collection(collection)
        .createIndex({ stableId: 1 }, { unique: true, name: "stableId_1" });
    }

    await db
      .collection("scholars")
      .createIndex(
        { "data.consentStatus": 1, "data.cohortYear": -1 },
        { name: "published_scholar_roster" },
      );
    await db
      .collection("office_hours_cycles")
      .createIndex({ "data.slug": 1 }, { unique: true, name: "cycle_slug_1" });
    await db
      .collection("office_hours_cycles")
      .createIndex(
        { "data.status": 1, "data.opensAt": -1 },
        { name: "cycle_status_opensAt" },
      );
    await db
      .collection("office_hours_answers")
      .createIndex(
        { "data.cycleId": 1, "data.publishedAt": -1 },
        { name: "answer_cycle_publishedAt" },
      );
    await db
      .collection("selah_entries")
      .createIndex({ "data.publishedAt": -1 }, { name: "selah_publishedAt" });
    await db
      .collection("rider_templates")
      .createIndex({ "data.key": 1 }, { unique: true, name: "rider_key_1" });
    await db
      .collection("rider_templates")
      .createIndex(
        { "data.engagementType": 1 },
        { name: "rider_engagementType" },
      );
    await db
      .collection("email_templates")
      .createIndex({ "data.key": 1 }, { unique: true, name: "email_key_1" });
    await db
      .collection("pages")
      .createIndex({ "data.slug": 1 }, { unique: true, name: "page_slug_1" });
  },
};
