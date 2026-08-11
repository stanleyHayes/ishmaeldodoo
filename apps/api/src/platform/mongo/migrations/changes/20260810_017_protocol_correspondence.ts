import type { MongoMigration } from "../types";

export const protocolCorrespondenceMigration: MongoMigration = {
  id: "20260810_017_protocol_correspondence",
  description:
    "Create the durable, idempotent Protocol Desk correspondence outbox",
  async up(db) {
    await db
      .collection("correspondence")
      .createIndex({ correspondenceId: 1 }, { unique: true });
    await db
      .collection("correspondence")
      .createIndex({ requestId: 1, createdAt: 1 });
    await db
      .collection("correspondence")
      .createIndex({ status: 1, availableAt: 1, lockedAt: 1 });
    await db.collection("correspondence").createIndex(
      { requestId: 1, template: 1 },
      {
        unique: true,
        partialFilterExpression: {
          template: { $in: ["acknowledgement", "status-update", "follow-up"] },
        },
      },
    );
  },
};
