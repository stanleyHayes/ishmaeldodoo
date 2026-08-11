import { Inject, Injectable } from "@nestjs/common";
import {
  ROOM_EXTENSION_MAX_COUNT,
  ROOM_RETENTION_DAYS,
  roomSubmissionSchema,
  type RoomCiphertext,
  type RoomEnquiryState,
  type RoomExtension,
  type RoomInboxPage,
  type RoomReceipt,
  type RoomSubmission,
} from "@amanor/contracts";
import {
  ROOM_DAY_MILLISECONDS,
  ciphertextBytes,
  ciphertextDigest,
  deletionDeadline,
  digestsMatch,
  newRoomReference,
} from "../domain/room-reference";
import {
  RoomEnquiryRepository,
  type RoomEnquiryRecord,
} from "../persistence/room-enquiry.repository";
import { RoomAuditService } from "./room-audit.service";

export class RoomSubmissionRejectedError extends Error {
  constructor() {
    // One message for every structural rejection. An attacker probing the
    // envelope format learns nothing about which field failed.
    super("Room submission was not accepted");
  }
}

export class RoomEnquiryNotFoundError extends Error {
  constructor() {
    super("Room enquiry was not found");
  }
}

const INBOX_LIMIT = 50;

@Injectable()
export class RoomEnquiryService {
  constructor(
    @Inject(RoomEnquiryRepository)
    private readonly repository: RoomEnquiryRepository,
    @Inject(RoomAuditService) private readonly audit: RoomAuditService,
  ) {}

  /**
   * Accepts ciphertext. Nothing in this method decrypts, parses or inspects the
   * payload: it validates shape and bounds, then stores.
   *
   * Retry and replay are told apart by digest. An identical resubmission of the
   * same envelope returns the original receipt, which is what makes a network
   * retry safe; a different ciphertext under an already-used envelope ID is
   * rejected with the same generic error as any other malformed input.
   */
  async accept(input: unknown, now = new Date()): Promise<RoomReceipt> {
    const parsed = roomSubmissionSchema.safeParse(input);
    if (!parsed.success) throw new RoomSubmissionRejectedError();
    const submission: RoomSubmission = parsed.data;
    const digest = ciphertextDigest(submission.envelope);

    const existing = await this.repository.findByEnvelopeId(
      submission.envelope.envelopeId,
    );
    if (existing) {
      if (!digestsMatch(existing.ciphertextDigest, digest)) {
        throw new RoomSubmissionRejectedError();
      }
      return this.receipt(existing);
    }

    const record: RoomEnquiryRecord = {
      reference: newRoomReference(now),
      envelopeId: submission.envelope.envelopeId,
      envelope: submission.envelope,
      ciphertextDigest: digest,
      ciphertextBytes: ciphertextBytes(submission.envelope),
      locale: submission.locale,
      recipientKeyId: submission.envelope.recipientKeyId,
      keyEpoch: submission.envelope.keyEpoch,
      state: "received",
      receivedAt: now,
      deleteAfter: deletionDeadline(now, ROOM_RETENTION_DAYS),
      extensionCount: 0,
      deletion: { status: "pending", attempts: 0 },
    };

    const { stored, created } = await this.repository.insertIfAbsent(record);
    if (created) {
      await this.audit.record(
        {
          action: "room_enquiry_received",
          reference: stored.reference,
          keyId: stored.recipientKeyId,
        },
        now,
      );
    }
    return this.receipt(stored);
  }

  async inbox(): Promise<RoomInboxPage> {
    const { items, total } = await this.repository.listInbox(INBOX_LIMIT);
    return {
      total,
      items: items.map((item) => ({
        reference: item.reference,
        state: item.state,
        locale: item.locale,
        recipientKeyId: item.recipientKeyId,
        keyEpoch: item.keyEpoch,
        receivedAt: item.receivedAt.toISOString(),
        deleteAfter: item.deleteAfter.toISOString(),
        extensionCount: item.extensionCount,
        ciphertextBytes: item.ciphertextBytes,
      })),
    };
  }

  /**
   * Releases ciphertext for local decryption. The audit event is written
   * *before* the ciphertext is returned and is not swallowed: if the Room audit
   * store is unavailable, the release fails rather than happening unrecorded.
   */
  async release(
    reference: string,
    actorId: string,
    now = new Date(),
  ): Promise<RoomCiphertext> {
    const record = await this.repository.findByReference(reference);
    if (!record || record.deletion.status === "done") {
      throw new RoomEnquiryNotFoundError();
    }
    if (record.deleteAfter <= now) {
      // Past its deadline, an item must not appear in the normal flow even if
      // the deletion worker has not yet reached it.
      throw new RoomEnquiryNotFoundError();
    }

    await this.audit.record(
      {
        action: "room_ciphertext_released",
        actorId,
        reference: record.reference,
        keyId: record.recipientKeyId,
      },
      now,
    );

    if (record.state === "received") {
      await this.repository.setState(record.reference, "read");
    }

    return {
      reference: record.reference,
      envelope: record.envelope,
      receivedAt: record.receivedAt.toISOString(),
      deleteAfter: record.deleteAfter.toISOString(),
    };
  }

  async changeState(
    reference: string,
    state: RoomEnquiryState,
    actorId: string,
    now = new Date(),
  ): Promise<void> {
    const changed = await this.repository.setState(reference, state);
    if (!changed) throw new RoomEnquiryNotFoundError();
    await this.audit.record(
      { action: "room_state_changed", actorId, reference },
      now,
    );
  }

  /**
   * Extension is explicit, reasoned by category, time-bounded and capped. The
   * cap is enforced in the update filter, not by reading and then writing, so
   * two concurrent extensions cannot both succeed past the ceiling.
   */
  async extend(
    reference: string,
    extension: RoomExtension,
    actorId: string,
    now = new Date(),
  ): Promise<RoomReceipt> {
    const record = await this.repository.findByReference(reference);
    if (!record || record.deletion.status === "done") {
      throw new RoomEnquiryNotFoundError();
    }

    const extended = new Date(
      Math.max(record.deleteAfter.getTime(), now.getTime()) +
        extension.days * ROOM_DAY_MILLISECONDS,
    );
    const applied = await this.repository.extendRetention({
      reference,
      deleteAfter: extended,
      maxCount: ROOM_EXTENSION_MAX_COUNT,
    });
    if (!applied) throw new RoomEnquiryNotFoundError();

    await this.audit.record(
      {
        action: "room_retention_extended",
        actorId,
        reference,
        keyId: record.recipientKeyId,
        reasonCategory: extension.reason,
      },
      now,
    );

    return {
      reference,
      status: "received",
      deleteAfter: extended.toISOString(),
    };
  }

  /** Rotation support: how much ciphertext is still bound to a given key. */
  async outstandingForKey(keyId: string): Promise<number> {
    return this.repository.countByRecipientKey(keyId);
  }

  private receipt(record: RoomEnquiryRecord): RoomReceipt {
    return {
      reference: record.reference,
      status: "received",
      deleteAfter: record.deleteAfter.toISOString(),
    };
  }
}
