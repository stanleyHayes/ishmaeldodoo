import type { MongoMigration } from "../types";

export const protocolAccessAuditMigration: MongoMigration = {
  id: "20260810_019_protocol_access_audit",
  description:
    "Classify Protocol Desk events and allow collision-free concurrent access audit entries",
  async up(db) {
    const events = db.collection("protocol_request_events");
    await events.updateMany(
      { category: { $exists: false } },
      { $set: { category: "action" } },
    );
    await events
      .dropIndex("requestId_1_occurredAt_1")
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          !/index not found/iu.test(error.message)
        )
          throw error;
      });
    await events.createIndex({ requestId: 1, occurredAt: 1, eventId: 1 });
  },
};
