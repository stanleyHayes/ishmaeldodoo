import type { MongoMigration } from "../types";

export const pressKitRequestsMigration: MongoMigration = {
  id: "20260809_004_press_kit_requests",
  description: "Create bounded Press Kit request receipt and retention indexes",
  async up(db) {
    await db
      .collection("press_kit_requests")
      .createIndex({ requestId: 1 }, { unique: true });
    await db.collection("press_kit_requests").createIndex({ generatedAt: -1 });
    await db
      .collection("press_kit_requests")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  },
};
