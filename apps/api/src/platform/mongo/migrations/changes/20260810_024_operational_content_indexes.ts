import type { Db } from "mongodb";
import type { MongoMigration } from "../types";

export const operationalContentIndexesMigration: MongoMigration = {
  id: "20260810_024_operational_content_indexes",
  description: "Add governed blackout and counterparty operational indexes",
  async up(db: Db) {
    for (const collection of [
      "blackouts",
      "counterparties",
      "desk_configurations",
    ] as const)
      await db
        .collection(collection)
        .createIndex({ stableId: 1 }, { unique: true, name: "stableId_1" });
    await db
      .collection("blackouts")
      .createIndex(
        { "data.startsAt": 1, "data.endsAt": 1 },
        { name: "blackout_interval" },
      );
    await db
      .collection("counterparties")
      .createIndex(
        { "data.organisationCanonical": 1, "data.country": 1 },
        { unique: true, name: "counterparty_organisation_country" },
      );
    await db
      .collection("desk_configurations")
      .createIndex(
        { "data.singletonKey": 1 },
        { unique: true, name: "desk_configuration_singleton" },
      );
    await db
      .collection("counterparties")
      .createIndex(
        { "data.status": 1, "data.reviewDueAt": 1 },
        { name: "counterparty_status_reviewDueAt" },
      );
  },
};
