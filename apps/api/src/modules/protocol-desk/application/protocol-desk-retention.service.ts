import { randomUUID } from "node:crypto";
import type { Document, WithId } from "mongodb";
import type { Connection } from "mongoose";

const policyVersion = "protocol-desk-36-months-v1";
const removed = "Removed after retention period";
const removedEmail = "removed@invalid.example";
const staleLockMilliseconds = 60 * 60 * 1_000;

type RetainedRequest = WithId<
  Document & {
    requestId: string;
    flags?: readonly Record<string, unknown>[];
    retention?: {
      status?: string;
      processingAt?: Date;
      retryAt?: Date;
      lockToken?: string;
      hold?: boolean;
    };
  }
>;

export function protocolDeskRetentionCutoff(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear() - 3,
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

export class ProtocolDeskRetentionService {
  constructor(private readonly connection: Connection) {}

  async run(
    now = new Date(),
    batchLimit = 100,
  ): Promise<Readonly<{ pseudonymised: number; failed: number }>> {
    if (!this.connection.db)
      throw new Error("MongoDB retention database is unavailable");
    const cutoff = protocolDeskRetentionCutoff(now);
    let pseudonymised = 0;
    let failed = 0;
    for (let count = 0; count < batchLimit; count += 1) {
      const lockToken = randomUUID();
      const claimed = await this.claim(cutoff, now, lockToken);
      if (!claimed) break;
      try {
        if (await this.pseudonymise(claimed, cutoff, now, lockToken))
          pseudonymised += 1;
      } catch (error) {
        failed += 1;
        await this.connection.db.collection("protocol_requests").updateOne(
          {
            _id: claimed._id,
            "retention.lockToken": lockToken,
          },
          {
            $set: {
              "retention.status": "failed",
              "retention.failedAt": now,
              "retention.retryAt": new Date(now.getTime() + 60 * 60 * 1_000),
              "retention.lastError":
                error instanceof Error
                  ? error.message.slice(0, 160)
                  : "Retention processing failed",
            },
            $unset: {
              "retention.processingAt": "",
              "retention.lockToken": "",
            },
          },
        );
      }
    }
    return { pseudonymised, failed };
  }

  private async claim(
    cutoff: Date,
    now: Date,
    lockToken: string,
  ): Promise<RetainedRequest | null> {
    if (!this.connection.db) return null;
    return this.connection.db
      .collection<RetainedRequest>("protocol_requests")
      .findOneAndUpdate(
        {
          createdAt: { $lte: cutoff },
          "retention.hold": { $ne: true },
          $or: [
            { "retention.status": { $exists: false } },
            {
              "retention.status": "failed",
              "retention.retryAt": { $lte: now },
            },
            {
              "retention.status": "processing",
              "retention.processingAt": {
                $lte: new Date(now.getTime() - staleLockMilliseconds),
              },
            },
          ],
        },
        {
          $set: {
            "retention.status": "processing",
            "retention.processingAt": now,
            "retention.lockToken": lockToken,
            "retention.policyVersion": policyVersion,
          },
          $unset: {
            "retention.failedAt": "",
            "retention.lastError": "",
            "retention.retryAt": "",
          },
        },
        { sort: { createdAt: 1, requestId: 1 }, returnDocument: "after" },
      );
  }

  private async pseudonymise(
    claimed: RetainedRequest,
    cutoff: Date,
    now: Date,
    lockToken: string,
  ): Promise<boolean> {
    if (!this.connection.db) return false;
    const database = this.connection.db;
    const session = await this.connection.startSession();
    let changed = false;
    try {
      await session.withTransaction(async () => {
        const current = await database
          .collection<RetainedRequest>("protocol_requests")
          .findOne(
            {
              _id: claimed._id,
              "retention.status": "processing",
              "retention.lockToken": lockToken,
              "retention.hold": { $ne: true },
            },
            { session },
          );
        if (!current) return;
        const flags = (current.flags ?? []).map((flag) => ({
          ...flag,
          detail: removed,
          ...(flag.clearanceReason ? { clearanceReason: removed } : {}),
        }));
        const result = await database.collection("protocol_requests").updateOne(
          { _id: current._id, "retention.lockToken": lockToken },
          {
            $set: {
              requester: {
                name: removed,
                role: removed,
                email: removedEmail,
              },
              "organisation.name": removed,
              "engagement.eventName": removed,
              "engagement.audienceDescription": removed,
              "ask.proposedTheme": removed,
              "ask.objective": removed,
              "logistics.contactName": removed,
              "logistics.contactPhone": removed,
              flags,
              retention: {
                status: "pseudonymised",
                policyVersion,
                cutoff,
                pseudonymisedAt: now,
              },
            },
            $unset: {
              capacityContext: "",
              capacityFunding: "",
              "organisation.website": "",
              "organisation.convenors": "",
              "engagement.venue": "",
              "engagement.edition": "",
              "ask.otherSpeakers": "",
              "logistics.securityConsiderations": "",
              assignedTo: "",
              assignedAt: "",
              assignedBy: "",
              protocolNoteConfiguration: "",
              triageAssessment: "",
            },
          },
          { session },
        );
        if (result.modifiedCount !== 1)
          throw new Error("Claimed Protocol Desk request was not retained");
        await database
          .collection("protocol_request_notes")
          .deleteMany({ requestId: current.requestId }, { session });
        await database.collection("correspondence").updateMany(
          {
            requestId: current.requestId,
            status: { $in: ["pending", "processing", "failed"] },
          },
          {
            $set: { status: "cancelled", recipient: removedEmail },
            $unset: {
              lockedAt: "",
              lastError: "",
              providerMessageId: "",
            },
          },
          { session },
        );
        await database.collection("correspondence").updateMany(
          { requestId: current.requestId },
          {
            $set: { recipient: removedEmail },
            $unset: { lastError: "", providerMessageId: "" },
          },
          { session },
        );
        changed = true;
      });
      return changed;
    } finally {
      await session.endSession();
    }
  }
}
