import type { IndexDescription } from "mongodb";
import type { RoomRepository } from "./room.repository";
import {
  ROOM_COLLECTIONS,
  type RoomCollectionName,
} from "./room-database.constants";

/**
 * Room indexes are applied through the Room credential, not the application
 * migration runner. The runner holds the application database user, and that
 * user is denied on Room collections by design (`room-database-boundary.md`),
 * so a migration that touched them would fail against a correctly permissioned
 * deployment. These definitions are forward-only and applied idempotently at
 * Room bootstrap instead.
 */
export const ROOM_INDEXES: Readonly<
  Record<RoomCollectionName, readonly IndexDescription[]>
> = {
  room_enquiries: [
    /** Idempotency and replay rejection: one stored envelope per identifier. */
    { key: { envelopeId: 1 }, name: "room_envelope_unique", unique: true },
    { key: { reference: 1 }, name: "room_reference_unique", unique: true },
    /** The operator inbox: newest first, bounded. */
    { key: { state: 1, receivedAt: -1 }, name: "room_inbox" },
    /** The deletion worker's scan; no TTL, because deletion must be evidenced. */
    {
      key: { deleteAfter: 1, "deletion.status": 1 },
      name: "room_deletion_scan",
    },
    /** Rotation support: how many items are still bound to a retiring key. */
    { key: { recipientKeyId: 1, keyEpoch: 1 }, name: "room_recipient_key" },
  ],
  room_events: [
    { key: { occurredAt: -1 }, name: "room_events_recent" },
    { key: { reference: 1, occurredAt: -1 }, name: "room_events_by_reference" },
  ],
  /**
   * Empty on purpose. The API holds `find` only on this collection, so it has
   * no `createIndex` grant — the publisher credential owns these indexes and
   * applies them in `scripts/publish-room-manifest.mjs`.
   */
  room_key_manifests: [],
};

/**
 * Deliberately not a TTL index. A TTL expiry would delete silently and leave no
 * content-free deletion evidence, which the threat model requires; the worker
 * deletes and records instead.
 */
export async function ensureRoomIndexes(
  repository: RoomRepository,
): Promise<void> {
  for (const name of ROOM_COLLECTIONS) {
    const definitions = ROOM_INDEXES[name];
    if (definitions.length === 0) continue;
    await repository.collection(name).createIndexes([...definitions]);
  }
}
