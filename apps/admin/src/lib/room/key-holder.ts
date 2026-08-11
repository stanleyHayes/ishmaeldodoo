import {
  decryptRoomEnvelope,
  toBase64Url,
  type RoomEnvelope,
  type RoomPlaintext,
} from "@amanor/contracts";

/**
 * Holds the recipient private key for the length of one unlocked session.
 *
 * Three properties matter here. The key is imported non-extractable, so it
 * cannot be read back out of WebCrypto by any script that later runs on the
 * page. It lives in a module variable and never touches `localStorage`,
 * `sessionStorage`, IndexedDB or a cookie. And it locks itself — on a timer, and
 * whenever the tab is hidden — because the realistic leak here is an unattended
 * screen, not a cryptographic break.
 *
 * Custody of the key *file* is an open Security decision (decision 2 in
 * `docs/security/the-room-threat-model.md`). Hardware-backed key agreement in a
 * browser needs WebAuthn PRF or a smartcard middleware; until Security chooses,
 * this holder takes an exported JWK and the custody burden sits with the
 * recipient's device, which the custody runbook states plainly.
 */

export const ROOM_AUTO_LOCK_MILLISECONDS = 5 * 60 * 1_000;

type Holder = Readonly<{
  privateKey: CryptoKey;
  publicKey: string;
  keyId: string;
  unlockedAt: number;
}>;

let holder: Holder | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function onRoomKeyChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function roomKeyState(): Readonly<{
  unlocked: boolean;
  keyId: string | null;
}> {
  return { unlocked: holder !== null, keyId: holder?.keyId ?? null };
}

export function lockRoomKey(): void {
  holder = null;
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
  notify();
}

function armAutoLock(): void {
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(lockRoomKey, ROOM_AUTO_LOCK_MILLISECONDS);
}

/**
 * Imports a recipient private key. The matching public key is derived from the
 * JWK's own coordinates rather than taken from the caller, so a mismatched pair
 * fails here instead of producing silent decryption failures later.
 */
export async function unlockRoomKey(
  input: Readonly<{ jwk: JsonWebKey; keyId: string }>,
): Promise<void> {
  const { kty, crv, d, x, y } = input.jwk;
  if (kty !== "EC" || crv !== "P-256" || !d || !x || !y) {
    throw new Error("A P-256 private key is required");
  }
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    input.jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const publicJwk: JsonWebKey = { kty, crv, x, y };
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  holder = {
    privateKey,
    publicKey: toBase64Url(
      new Uint8Array(await crypto.subtle.exportKey("raw", publicKey)),
    ),
    keyId: input.keyId,
    unlockedAt: Date.now(),
  };
  armAutoLock();
  notify();
}

export async function decryptWithRoomKey(
  envelope: RoomEnvelope,
): Promise<RoomPlaintext> {
  if (!holder) throw new Error("The Room key is locked");
  if (envelope.recipientKeyId !== holder.keyId) {
    // Ciphertext bound to a different key — most often one this recipient never
    // held. Say so rather than surfacing an opaque AEAD failure.
    throw new Error("This submission was encrypted to a different key");
  }
  const plaintext = await decryptRoomEnvelope({
    envelope,
    recipientPrivateKey: holder.privateKey,
    recipientPublicKey: holder.publicKey,
  });
  // Every successful decryption is fresh activity; the lock window restarts.
  armAutoLock();
  return plaintext;
}

/** Locks whenever the tab is hidden, so an unattended screen holds nothing. */
export function installRoomAutoLock(target: Document = document): () => void {
  const handler = () => {
    if (target.visibilityState === "hidden") lockRoomKey();
  };
  target.addEventListener("visibilitychange", handler);
  return () => target.removeEventListener("visibilitychange", handler);
}
