import {
  securityEventHash,
  type SecurityEvent,
} from "../../../../modules/auth/application/security-event";
import type { MongoMigration } from "../types";

export const authAuditIntegrityMigration: MongoMigration = {
  id: "20260810_011_auth_audit_integrity",
  description: "Backfill and enforce the authentication audit hash chain",
  async up(db) {
    const events = db.collection<SecurityEvent>("auth_events");
    let previousEventHash: string | undefined;
    let lastEventId: string | undefined;
    let chainSequence = 0;
    for await (const event of events
      .find({})
      .sort({ occurredAt: 1, eventId: 1 })) {
      chainSequence += 1;
      const chainedEvent = { ...event, chainSequence };
      const eventHash = securityEventHash(chainedEvent, previousEventHash);
      await events.updateOne(
        { eventId: event.eventId },
        {
          $set: {
            eventHash,
            chainSequence,
            ...(previousEventHash ? { previousEventHash } : {}),
          },
          ...(!previousEventHash ? { $unset: { previousEventHash: "" } } : {}),
        },
      );
      previousEventHash = eventHash;
      lastEventId = event.eventId;
    }
    if (previousEventHash && lastEventId) {
      await db
        .collection<{
          _id: string;
          eventHash: string;
          eventId: string;
          sequence: number;
        }>("auth_event_chain")
        .updateOne(
          { _id: "global" },
          {
            $set: {
              eventHash: previousEventHash,
              eventId: lastEventId,
              sequence: chainSequence,
            },
          },
          { upsert: true },
        );
    }
    await events.createIndex({ eventHash: 1 }, { unique: true, sparse: true });
  },
};
