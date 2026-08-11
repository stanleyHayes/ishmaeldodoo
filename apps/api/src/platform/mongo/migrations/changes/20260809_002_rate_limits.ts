import type { MongoMigration } from "../types";

export const rateLimitMigration: MongoMigration = {
  id: "20260809_002_rate_limits",
  description:
    "Create privacy-preserving distributed authentication rate-limit indexes",
  async up(db) {
    await db
      .collection("rate_limits")
      .createIndex({ key: 1, windowStart: 1 }, { unique: true });
    await db
      .collection("rate_limits")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  },
};
