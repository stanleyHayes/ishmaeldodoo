import { createHash } from "node:crypto";
import type { MongoMigration } from "../types";

type LegacyEvent = {
  eventId: string;
  documentType: string;
  documentId: string;
  version?: number;
  actorId: string;
  action: string;
  occurredAt: Date;
  metadata?: Record<string, string | number | boolean | null>;
  previousEventHash?: string;
  eventHash: string;
};

function digest(
  event: LegacyEvent,
  sequence: number,
  previousEventHash?: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        eventId: event.eventId,
        documentType: event.documentType,
        documentId: event.documentId,
        version: event.version ?? null,
        actorId: event.actorId,
        action: event.action,
        sequence,
        occurredAt: event.occurredAt.toISOString(),
        metadata: event.metadata ?? {},
        changes: [],
        previousEventHash: previousEventHash ?? null,
      }),
    )
    .digest("hex");
}

export const editorialAuditIntegrityMigration: MongoMigration = {
  id: "20260810_015_editorial_audit_integrity",
  description:
    "Sequence editorial audit chains and create scoped fork-resistant heads",
  async up(db) {
    const events = await db
      .collection<LegacyEvent>("editorial_audit")
      .find({}, { projection: { _id: 0 } })
      .sort({ documentType: 1, documentId: 1, occurredAt: 1, eventId: 1 })
      .toArray();
    let scope = "";
    let sequence = 0;
    let previousEventHash: string | undefined;
    for (const event of events) {
      const nextScope = `${event.documentType}\u0000${event.documentId}`;
      if (nextScope !== scope) {
        scope = nextScope;
        sequence = 0;
        previousEventHash = undefined;
      }
      sequence += 1;
      const eventHash = digest(event, sequence, previousEventHash);
      await db.collection("editorial_audit").updateOne(
        { eventId: event.eventId },
        {
          $set: { sequence, changes: [], eventHash },
          ...(previousEventHash
            ? { $set: { sequence, changes: [], eventHash, previousEventHash } }
            : { $unset: { previousEventHash: "" } }),
        },
      );
      await db.collection("editorial_audit_heads").updateOne(
        {
          documentType: event.documentType,
          documentId: event.documentId,
        },
        {
          $set: {
            sequence,
            eventHash,
            updatedAt: event.occurredAt,
          },
        },
        { upsert: true },
      );
      previousEventHash = eventHash;
    }
    await db
      .collection("editorial_audit")
      .createIndex(
        { documentType: 1, documentId: 1, sequence: 1 },
        { unique: true },
      );
    await db
      .collection("editorial_audit_heads")
      .createIndex({ documentType: 1, documentId: 1 }, { unique: true });
  },
};
