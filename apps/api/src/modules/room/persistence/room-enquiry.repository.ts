import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import type {
  RoomAuditAction,
  RoomEnquiryState,
  RoomEnvelope,
  RoomExtensionReason,
  RoomKeyManifest,
} from "@amanor/contracts";
import { ensureRoomIndexes } from "./room-indexes";
import { RoomRepository } from "./room.repository";

export type RoomEnquiryRecord = Readonly<{
  reference: string;
  envelopeId: string;
  envelope: RoomEnvelope;
  ciphertextDigest: string;
  ciphertextBytes: number;
  locale: "en-GB" | "fr-FR";
  recipientKeyId: string;
  keyEpoch: number;
  state: RoomEnquiryState;
  receivedAt: Date;
  deleteAfter: Date;
  extensionCount: number;
  deletion: Readonly<{
    status: "pending" | "failed" | "done";
    attempts: number;
  }>;
}>;

export type RoomAuditRecord = Readonly<{
  action: RoomAuditAction;
  actorId: string | null;
  reference: string | null;
  keyId: string | null;
  reasonCategory: RoomExtensionReason | null;
  occurredAt: Date;
}>;

export type RoomRetentionHealth = Readonly<{
  due: number;
  failed: number;
  oldestOverdueSeconds: number;
}>;

/**
 * Every Room read and write goes through the Room credential's collection
 * allowlist. Nothing here accepts or returns a plaintext field, and no method
 * exposes a filter that could be used to search content: the only queryable
 * values are references, states, keys and timestamps.
 */
@Injectable()
export class RoomEnquiryRepository implements OnApplicationBootstrap {
  private readonly logger = new Logger(RoomEnquiryRepository.name);

  constructor(@Inject(RoomRepository) private readonly room: RoomRepository) {}

  /**
   * Room indexes are applied through the Room credential at bootstrap rather
   * than by the application migration runner, which is denied on these
   * collections. Failure is loud but not fatal: the unique indexes are a
   * correctness guard, and a deployment that cannot create them must be seen,
   * not silently degraded.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await ensureRoomIndexes(this.room);
    } catch {
      this.logger.error("Room index application failed");
    }
  }

  private get enquiries(): ReturnType<RoomRepository["collection"]> {
    return this.room.collection("room_enquiries");
  }

  private get events(): ReturnType<RoomRepository["collection"]> {
    return this.room.collection("room_events");
  }

  private get manifests(): ReturnType<RoomRepository["collection"]> {
    return this.room.collection("room_key_manifests");
  }

  async insertIfAbsent(
    record: RoomEnquiryRecord,
  ): Promise<Readonly<{ stored: RoomEnquiryRecord; created: boolean }>> {
    const existing = await this.findByEnvelopeId(record.envelopeId);
    if (existing) return { stored: existing, created: false };
    try {
      await this.enquiries.insertOne({ ...record });
      return { stored: record, created: true };
    } catch (error) {
      // A concurrent identical retry loses the unique-index race; re-read so the
      // submitter still receives their original reference rather than an error.
      const raced = await this.findByEnvelopeId(record.envelopeId);
      if (raced) return { stored: raced, created: false };
      throw error;
    }
  }

  async findByEnvelopeId(
    envelopeId: string,
  ): Promise<RoomEnquiryRecord | null> {
    const document = await this.enquiries.findOne({ envelopeId });
    return document ? (document as unknown as RoomEnquiryRecord) : null;
  }

  async findByReference(reference: string): Promise<RoomEnquiryRecord | null> {
    const document = await this.enquiries.findOne({ reference });
    return document ? (document as unknown as RoomEnquiryRecord) : null;
  }

  async listInbox(
    limit: number,
  ): Promise<Readonly<{ items: readonly RoomEnquiryRecord[]; total: number }>> {
    const [documents, total] = await Promise.all([
      this.enquiries
        .find({ "deletion.status": { $ne: "done" } })
        .sort({ receivedAt: -1 })
        .limit(limit)
        .toArray(),
      this.enquiries.countDocuments({ "deletion.status": { $ne: "done" } }),
    ]);
    return { items: documents as unknown as RoomEnquiryRecord[], total };
  }

  async setState(reference: string, state: RoomEnquiryState): Promise<boolean> {
    const result = await this.enquiries.updateOne(
      { reference },
      { $set: { state } },
    );
    return result.matchedCount === 1;
  }

  /**
   * Bounded by count and by absolute deadline in the same atomic update, so two
   * concurrent extensions cannot together exceed the approved ceiling.
   */
  async extendRetention(input: {
    reference: string;
    deleteAfter: Date;
    maxCount: number;
  }): Promise<boolean> {
    const result = await this.enquiries.updateOne(
      { reference: input.reference, extensionCount: { $lt: input.maxCount } },
      { $set: { deleteAfter: input.deleteAfter }, $inc: { extensionCount: 1 } },
    );
    return result.modifiedCount === 1;
  }

  async findExpired(
    now: Date,
    limit: number,
  ): Promise<readonly RoomEnquiryRecord[]> {
    const documents = await this.enquiries
      .find({
        deleteAfter: { $lte: now },
        "deletion.status": { $in: ["pending", "failed"] },
      })
      .limit(limit)
      .toArray();
    return documents as unknown as RoomEnquiryRecord[];
  }

  async retentionHealth(now: Date): Promise<RoomRetentionHealth> {
    const dueFilter = {
      deleteAfter: { $lte: now },
      "deletion.status": { $in: ["pending", "failed"] },
    };
    const [due, failed, oldest] = await Promise.all([
      this.enquiries.countDocuments(dueFilter),
      this.enquiries.countDocuments({
        deleteAfter: { $lte: now },
        "deletion.status": "failed",
      }),
      this.enquiries.find(dueFilter).sort({ deleteAfter: 1 }).limit(1).next(),
    ]);
    const oldestDeleteAfter = oldest
      ? (oldest as unknown as RoomEnquiryRecord).deleteAfter
      : null;
    return {
      due,
      failed,
      oldestOverdueSeconds: oldestDeleteAfter
        ? Math.max(0, (now.getTime() - oldestDeleteAfter.getTime()) / 1_000)
        : 0,
    };
  }

  /**
   * Removes ciphertext and routing metadata, leaving a content-free tombstone so
   * a restored backup can be reconciled against what was deleted. The tombstone
   * carries no locale, no key material and no size.
   */
  async deleteEnquiry(reference: string, deletedAt: Date): Promise<boolean> {
    const result = await this.enquiries.updateOne(
      { reference },
      {
        $set: {
          state: "actioned",
          deletion: { status: "done", attempts: 0, deletedAt },
        },
        $unset: {
          envelope: "",
          ciphertextDigest: "",
          ciphertextBytes: "",
          locale: "",
          recipientKeyId: "",
          keyEpoch: "",
          envelopeId: "",
        },
      },
    );
    return result.modifiedCount === 1;
  }

  async recordDeletionFailure(reference: string): Promise<void> {
    await this.enquiries.updateOne(
      { reference },
      {
        $set: { "deletion.status": "failed" },
        $inc: { "deletion.attempts": 1 },
      },
    );
  }

  /** Append-only. The Room credential holds no update or delete grant here. */
  async appendEvent(event: RoomAuditRecord): Promise<void> {
    await this.events.insertOne({ ...event });
  }

  async listEvents(limit: number): Promise<readonly RoomAuditRecord[]> {
    const documents = await this.events
      .find({})
      .sort({ occurredAt: -1 })
      .limit(limit)
      .toArray();
    return documents as unknown as RoomAuditRecord[];
  }

  /**
   * Read-only by design. The Room credential holds `find` and nothing else on
   * `room_key_manifests`, so the API cannot publish or retire a recipient key
   * even if it is fully compromised. Publication is an out-of-band dual-control
   * action performed with a separate credential — see
   * `scripts/publish-room-manifest.mjs` and `room-key-custody-and-recovery.md`.
   */
  async activeManifest(): Promise<RoomKeyManifest | null> {
    const document = await this.manifests
      .find({ active: true })
      .sort({ publishedAt: -1 })
      .limit(1)
      .next();
    return document
      ? ((document as unknown as { manifest: RoomKeyManifest }).manifest ??
          null)
      : null;
  }

  async countByRecipientKey(keyId: string): Promise<number> {
    return this.enquiries.countDocuments({
      recipientKeyId: keyId,
      "deletion.status": { $ne: "done" },
    });
  }
}
