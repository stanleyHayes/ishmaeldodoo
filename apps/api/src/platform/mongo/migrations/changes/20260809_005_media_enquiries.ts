import type { MongoMigration } from "../types";
export const mediaEnquiriesMigration: MongoMigration = {
  id: "20260809_005_media_enquiries",
  description: "Create durable media enquiry delivery and retention indexes",
  async up(db) {
    await db
      .collection("media_enquiries")
      .createIndex({ reference: 1 }, { unique: true });
    await db
      .collection("media_enquiries")
      .createIndex({ status: 1, availableAt: 1 });
    await db
      .collection("media_enquiries")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  },
};
