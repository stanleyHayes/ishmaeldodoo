import { Inject, Injectable } from "@nestjs/common";
import type { RoomDesignationState } from "@amanor/contracts";
import { RoomRepository } from "../persistence/room.repository";

type DesignationEvent = {
  action: "room_designation_granted" | "room_designation_revoked";
  designateUserId?: string;
  designateExpiresAt?: Date;
  occurredAt: Date;
};

export class RoomDesignationRejectedError extends Error {}

/**
 * At most two humans may read The Room: the Principal, by role, and one
 * designate, by explicit expiring grant.
 *
 * Designation state is *folded from the append-only event log* rather than held
 * as a mutable row. That is not a stylistic choice: the Room credential holds
 * `find` and `insert` on `room_events` and nothing else
 * (`room-database-boundary.md`), so there is no update or delete grant with
 * which a compromised API could rewrite who has access. Revocation is itself an
 * appended event, and the newest event wins.
 *
 * The store is the Room database, so an attacker holding an ordinary CMS or
 * application credential cannot grant themselves access at all.
 */
@Injectable()
export class RoomDesignationService {
  constructor(@Inject(RoomRepository) private readonly room: RoomRepository) {}

  private get events(): ReturnType<RoomRepository["collection"]> {
    return this.room.collection("room_events");
  }

  async current(now = new Date()): Promise<RoomDesignationState> {
    const latest = (await this.events
      .find({
        action: {
          $in: ["room_designation_granted", "room_designation_revoked"],
        },
      })
      .sort({ occurredAt: -1 })
      .limit(1)
      .next()) as DesignationEvent | null;

    if (
      !latest ||
      latest.action !== "room_designation_granted" ||
      !latest.designateUserId ||
      !latest.designateExpiresAt
    ) {
      return { designate: null };
    }

    return {
      designate: {
        userId: latest.designateUserId,
        grantedAt: latest.occurredAt.toISOString(),
        expiresAt: latest.designateExpiresAt.toISOString(),
        active: latest.designateExpiresAt > now,
      },
    };
  }

  async isDesignate(userId: string, now = new Date()): Promise<boolean> {
    const state = await this.current(now);
    return state.designate?.userId === userId && state.designate.active;
  }

  async grant(
    input: Readonly<{ userId: string; expiresAt: Date }>,
    actorId: string,
    now = new Date(),
  ): Promise<RoomDesignationState> {
    if (input.expiresAt <= now) {
      throw new RoomDesignationRejectedError(
        "Room designation must expire in the future",
      );
    }
    if (input.userId === actorId) {
      // Nobody designates themselves. The threat model denies this to the
      // Security Administrator explicitly, and it costs nothing to deny it to
      // the Principal too.
      throw new RoomDesignationRejectedError(
        "Room designation cannot be granted to the granting actor",
      );
    }

    const existing = await this.current(now);
    if (existing.designate?.active) {
      throw new RoomDesignationRejectedError(
        "A Room designate is already active; revoke it first",
      );
    }

    await this.events.insertOne({
      action: "room_designation_granted",
      actorId,
      reference: null,
      keyId: null,
      reasonCategory: null,
      designateUserId: input.userId,
      designateExpiresAt: input.expiresAt,
      occurredAt: now,
    });
    return this.current(now);
  }

  async revoke(
    actorId: string,
    now = new Date(),
  ): Promise<RoomDesignationState> {
    await this.events.insertOne({
      action: "room_designation_revoked",
      actorId,
      reference: null,
      keyId: null,
      reasonCategory: null,
      occurredAt: now,
    });
    return this.current(now);
  }
}
