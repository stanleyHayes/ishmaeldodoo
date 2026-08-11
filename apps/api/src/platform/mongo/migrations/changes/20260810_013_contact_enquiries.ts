import type { MongoMigration } from "../types";

export const contactEnquiriesMigration: MongoMigration = {
  id: "20260810_013_contact_enquiries",
  description: "Create durable general contact delivery and retention indexes",
  async up(db) {
    await db
      .collection("contact_enquiries")
      .createIndex({ reference: 1 }, { unique: true });
    await db
      .collection("contact_enquiries")
      .createIndex({ status: 1, availableAt: 1 });
    await db
      .collection("contact_enquiries")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  },
};
