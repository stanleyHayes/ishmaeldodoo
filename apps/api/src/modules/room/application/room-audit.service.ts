import { Inject, Injectable } from "@nestjs/common";
import type { RoomAuditAction, RoomExtensionReason } from "@amanor/contracts";
import { RoomEnquiryRepository } from "../persistence/room-enquiry.repository";

export type RoomAuditInput = Readonly<{
  action: RoomAuditAction;
  actorId?: string | null;
  reference?: string | null;
  keyId?: string | null;
  reasonCategory?: RoomExtensionReason | null;
}>;

/**
 * The only writer of Room audit evidence. It accepts a closed set of actions and
 * four nullable identifiers, so there is no parameter through which a caller
 * could persist free text, a subject, an address or an IP. Free-text reasons are
 * forbidden by the threat model; the type system is where that is enforced.
 */
@Injectable()
export class RoomAuditService {
  constructor(
    @Inject(RoomEnquiryRepository)
    private readonly repository: RoomEnquiryRepository,
  ) {}

  async record(input: RoomAuditInput, now = new Date()): Promise<void> {
    await this.repository.appendEvent({
      action: input.action,
      actorId: input.actorId ?? null,
      reference: input.reference ?? null,
      keyId: input.keyId ?? null,
      reasonCategory: input.reasonCategory ?? null,
      occurredAt: now,
    });
  }

  /**
   * Audit failure must not silently succeed for a read that already happened,
   * and must not leak the reason to the caller. Callers that append *before*
   * releasing data use `record` directly and fail closed; this helper exists for
   * the deny path, where the request is already being rejected.
   */
  async recordQuietly(input: RoomAuditInput, now = new Date()): Promise<void> {
    try {
      await this.record(input, now);
    } catch {
      // Intentionally swallowed: the caller is already returning a denial, and
      // surfacing the audit fault here would turn a generic 403 into a signal.
    }
  }
}
