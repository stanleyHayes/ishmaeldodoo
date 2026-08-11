import type { MongoMigration } from "../types";

export const protocolDecisionCapabilitiesMigration: MongoMigration = {
  id: "20260810_030_protocol_decision_capabilities",
  description:
    "Create expiring one-time capabilities for sessionless Principal decisions",
  async up(db) {
    const capabilities = db.collection("protocol_decision_capabilities");
    await capabilities.createIndex({ capabilityId: 1 }, { unique: true });
    await capabilities.createIndex({ tokenHash: 1 }, { unique: true });
    await capabilities.createIndex({ requestId: 1, status: 1, expiresAt: 1 });
    await capabilities.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "expire_consumed_decision_capabilities" },
    );
  },
};
