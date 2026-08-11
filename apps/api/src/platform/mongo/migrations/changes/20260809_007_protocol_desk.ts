import type { MongoMigration } from "../types";

export const protocolDeskMigration: MongoMigration = {
  id: "20260809_007_protocol_desk",
  description:
    "Create Protocol Desk request, organisation and append-only event indexes",
  async up(db) {
    await db
      .collection("protocol_requests")
      .createIndex({ reference: 1 }, { unique: true });
    await db
      .collection("protocol_requests")
      .createIndex({ state: 1, triageScore: -1, createdAt: 1 });
    await db
      .collection("protocol_requests")
      .createIndex({ "organisation.name": 1, createdAt: -1 });
    await db
      .collection("protocol_requests")
      .createIndex({ "requester.email": 1, createdAt: -1 });
    await db
      .collection("protocol_request_events")
      .createIndex({ eventId: 1 }, { unique: true });
    await db
      .collection("protocol_request_events")
      .createIndex({ requestId: 1, occurredAt: 1 }, { unique: true });
    await db
      .collection("protocol_request_notes")
      .createIndex({ noteId: 1 }, { unique: true });
    await db
      .collection("protocol_request_notes")
      .createIndex({ requestId: 1, createdAt: 1 });
    await db
      .collection("protocol_sequences")
      .createIndex({ key: 1 }, { unique: true });
  },
};
