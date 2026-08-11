import type { MongoMigration } from "../types";

export const authAuditMigration: MongoMigration = {
  id: "20260810_010_auth_audit",
  description: "Add stable authentication audit pagination index",
  async up(db) {
    await db
      .collection("auth_events")
      .createIndex({ occurredAt: -1, eventId: -1 });
  },
};
