import type { MongoMigration } from "../types";

export const protocolSlaMigration: MongoMigration = {
  id: "20260810_018_protocol_sla",
  description: "Create the deduplicated Protocol Desk SLA escalation queue",
  async up(database) {
    const escalations = database.collection("protocol_sla_escalations");
    await escalations.createIndex(
      { deduplicationKey: 1 },
      { unique: true, name: "protocol_sla_deduplication_unique" },
    );
    await escalations.createIndex(
      { status: 1, openedAt: 1 },
      { name: "protocol_sla_open_queue" },
    );
  },
};
