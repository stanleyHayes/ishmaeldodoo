import type { MongoMigration } from "../types";

export const revalidationClaimsMigration: MongoMigration = {
  id: "20260810_008_revalidation_claims",
  description:
    "Create unique and expiring cross-instance revalidation replay claims",
  async up(db) {
    await db
      .collection("revalidation_claims")
      .createIndex({ idempotencyKey: 1 }, { unique: true });
    await db
      .collection("revalidation_claims")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  },
};
