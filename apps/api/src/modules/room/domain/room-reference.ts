import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { RoomEnvelope } from "@amanor/contracts";

/** RFC 4648 base32 without padding, so a reference is unambiguous when read aloud. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const REFERENCE_CHARACTERS = 16;

/**
 * Public receipts are 80 bits of CSPRNG output. They are never derived from
 * content, never sequential, and never usable to look a submission up from the
 * public internet: there is no public status route.
 */
export function newRoomReference(now = new Date()): string {
  const bytes = randomBytes(REFERENCE_CHARACTERS);
  let suffix = "";
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length];
  return `RM-${now.getUTCFullYear()}-${suffix}`;
}

/**
 * Identifies a retry of the same submission without reading the ciphertext.
 * A repeated envelope ID carrying different ciphertext is a replay or tamper
 * attempt, not a retry, and the two cases must be told apart before either is
 * answered.
 */
export function ciphertextDigest(envelope: RoomEnvelope): string {
  return createHash("sha256")
    .update(
      [
        envelope.envelopeId,
        envelope.recipientKeyId,
        String(envelope.keyEpoch),
        envelope.ephemeralPublicKey,
        envelope.nonce,
        envelope.ciphertext,
      ].join("\n"),
    )
    .digest("hex");
}

export function digestsMatch(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

/** Ciphertext size is recorded for storage quotas; it reveals no content. */
export function ciphertextBytes(envelope: RoomEnvelope): number {
  return Buffer.byteLength(envelope.ciphertext, "utf8");
}

export const ROOM_DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

export function deletionDeadline(receivedAt: Date, days: number): Date {
  return new Date(receivedAt.getTime() + days * ROOM_DAY_MILLISECONDS);
}
