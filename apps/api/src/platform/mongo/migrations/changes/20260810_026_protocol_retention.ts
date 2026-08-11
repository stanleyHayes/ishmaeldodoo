import type { MongoMigration } from "../types";

export const protocolRetentionMigration: MongoMigration = {
  id: "20260810_026_protocol_retention",
  description:
    "Create the bounded Protocol Desk retention and stale-claim scan index",
  async up(database) {
    await database.collection("protocol_requests").createIndex(
      {
        "retention.hold": 1,
        "retention.status": 1,
        "retention.processingAt": 1,
        createdAt: 1,
        requestId: 1,
      },
      { name: "protocol_retention_scan" },
    );
  },
};
