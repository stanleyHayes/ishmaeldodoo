import {
  ROOM_ENVELOPE_PURPOSE,
  ROOM_ENVELOPE_SUITE,
  ROOM_ENVELOPE_VERSION,
  ROOM_HKDF_INFO,
  ROOM_MANIFEST_SIGNATURE_ALGORITHM,
  ROOM_PLAINTEXT_MAX_BYTES,
  canonicalRoomKeyManifestPayload,
  roomEnvelopeAssociatedData,
  roomEnvelopeSchema,
  roomKeyManifestSchema,
  roomPlaintextSchema,
  type RoomEnvelope,
  type RoomKeyManifest,
  type RoomKeyManifestBody,
  type RoomPlaintext,
  type RoomRecipientKey,
} from "./room.js";

/**
 * Suite v1 primitives for The Room, implemented against WebCrypto only so the
 * identical code path runs in the submitter's browser, the restricted operator
 * client and Node-based verification tests. The API never calls the decryption
 * helpers in production; they exist for the restricted client and for tests
 * that must prove ciphertext-only storage really is recoverable by the holder
 * of the private key and by nobody else.
 */

const CURVE = { name: "ECDH", namedCurve: "P-256" } as const;
const SIGNING_CURVE = { name: "ECDSA", namedCurve: "P-256" } as const;
const NONCE_BYTES = 12;
const AES_KEY_BITS = 256;
const SHARED_SECRET_BITS = 256;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function subtle(source?: Crypto): SubtleCrypto {
  const provider = source ?? globalThis.crypto;
  if (!provider?.subtle) {
    throw new Error("Room encryption requires WebCrypto");
  }
  return provider.subtle;
}

function randomBytes(length: number, source?: Crypto): Uint8Array {
  const provider = source ?? globalThis.crypto;
  if (!provider?.getRandomValues) {
    throw new Error("Room encryption requires a secure random source");
  }
  return provider.getRandomValues(new Uint8Array(length));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=/gu, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** WebCrypto rejects a `Uint8Array<ArrayBufferLike>` where it wants a buffer. */
function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left, 0);
  joined.set(right, left.length);
  return joined;
}

/**
 * Derives the content-encryption key. The salt binds both public points and the
 * info binds purpose, suite, recipient key and epoch, so a derived key cannot be
 * replayed against a different recipient, epoch or channel.
 */
async function deriveContentKey(
  input: Readonly<{
    sharedSecret: ArrayBuffer;
    ephemeralPublicKey: Uint8Array;
    recipientPublicKey: Uint8Array;
    recipientKeyId: string;
    keyEpoch: number;
    usage: "encrypt" | "decrypt";
  }>,
  crypto?: Crypto,
): Promise<CryptoKey> {
  const material = await subtle(crypto).importKey(
    "raw",
    input.sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return subtle(crypto).deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: buffer(concat(input.ephemeralPublicKey, input.recipientPublicKey)),
      info: buffer(
        textEncoder.encode(
          `${ROOM_HKDF_INFO}\n${ROOM_ENVELOPE_PURPOSE}\n${ROOM_ENVELOPE_SUITE}\n${input.recipientKeyId}\n${input.keyEpoch}`,
        ),
      ),
    },
    material,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    [input.usage],
  );
}

/**
 * Selects the recipient key a submission must use. Retiring keys stay valid for
 * decryption but are never offered for new submissions, which is what makes a
 * rotation safe rather than a cliff edge.
 */
export function selectRoomRecipientKey(
  body: RoomKeyManifestBody,
  at: Date = new Date(),
): RoomRecipientKey {
  const timestamp = at.getTime();
  const usable = body.keys.filter(
    (key) =>
      key.status === "active" &&
      Date.parse(key.notBefore) <= timestamp &&
      Date.parse(key.notAfter) > timestamp,
  );
  const selected = usable.sort((left, right) => right.epoch - left.epoch)[0];
  if (!selected) {
    throw new Error("No Room recipient key is valid");
  }
  return selected;
}

export async function encryptRoomEnvelope(
  input: Readonly<{
    plaintext: RoomPlaintext;
    recipient: RoomRecipientKey;
    crypto?: Crypto;
  }>,
): Promise<RoomEnvelope> {
  const plaintext = roomPlaintextSchema.parse(input.plaintext);
  const serialised = textEncoder.encode(JSON.stringify(plaintext));
  if (serialised.byteLength > ROOM_PLAINTEXT_MAX_BYTES) {
    throw new Error("Room submission exceeds the permitted length");
  }

  const recipientPublicKey = fromBase64Url(input.recipient.publicKey);
  const recipientKey = await subtle(input.crypto).importKey(
    "raw",
    buffer(recipientPublicKey),
    CURVE,
    false,
    [],
  );
  const ephemeral = await subtle(input.crypto).generateKey(CURVE, false, [
    "deriveBits",
  ]);
  const ephemeralPublicKey = new Uint8Array(
    await subtle(input.crypto).exportKey("raw", ephemeral.publicKey),
  );
  const sharedSecret = await subtle(input.crypto).deriveBits(
    { name: "ECDH", public: recipientKey },
    ephemeral.privateKey,
    SHARED_SECRET_BITS,
  );
  const contentKey = await deriveContentKey(
    {
      sharedSecret,
      ephemeralPublicKey,
      recipientPublicKey,
      recipientKeyId: input.recipient.keyId,
      keyEpoch: input.recipient.epoch,
      usage: "encrypt",
    },
    input.crypto,
  );

  const nonce = randomBytes(NONCE_BYTES, input.crypto);
  const ciphertext = new Uint8Array(
    await subtle(input.crypto).encrypt(
      {
        name: "AES-GCM",
        iv: buffer(nonce),
        additionalData: buffer(
          textEncoder.encode(
            roomEnvelopeAssociatedData({
              recipientKeyId: input.recipient.keyId,
              keyEpoch: input.recipient.epoch,
            }),
          ),
        ),
      },
      contentKey,
      buffer(serialised),
    ),
  );

  return roomEnvelopeSchema.parse({
    envelopeVersion: ROOM_ENVELOPE_VERSION,
    suite: ROOM_ENVELOPE_SUITE,
    envelopeId: [...randomBytes(16, input.crypto)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
    recipientKeyId: input.recipient.keyId,
    keyEpoch: input.recipient.epoch,
    ephemeralPublicKey: toBase64Url(ephemeralPublicKey),
    nonce: toBase64Url(nonce),
    ciphertext: toBase64Url(ciphertext),
  });
}

/**
 * Runs only where a recipient private key is present: the restricted operator
 * client, and tests. A failure here must leave the ciphertext untouched.
 */
export async function decryptRoomEnvelope(
  input: Readonly<{
    envelope: RoomEnvelope;
    recipientPrivateKey: CryptoKey;
    recipientPublicKey: string;
    crypto?: Crypto;
  }>,
): Promise<RoomPlaintext> {
  const envelope = roomEnvelopeSchema.parse(input.envelope);
  const ephemeralPublicKey = fromBase64Url(envelope.ephemeralPublicKey);
  const ephemeral = await subtle(input.crypto).importKey(
    "raw",
    buffer(ephemeralPublicKey),
    CURVE,
    false,
    [],
  );
  const sharedSecret = await subtle(input.crypto).deriveBits(
    { name: "ECDH", public: ephemeral },
    input.recipientPrivateKey,
    SHARED_SECRET_BITS,
  );
  const contentKey = await deriveContentKey(
    {
      sharedSecret,
      ephemeralPublicKey,
      recipientPublicKey: fromBase64Url(input.recipientPublicKey),
      recipientKeyId: envelope.recipientKeyId,
      keyEpoch: envelope.keyEpoch,
      usage: "decrypt",
    },
    input.crypto,
  );

  const plaintext = await subtle(input.crypto).decrypt(
    {
      name: "AES-GCM",
      iv: buffer(fromBase64Url(envelope.nonce)),
      additionalData: buffer(
        textEncoder.encode(
          roomEnvelopeAssociatedData({
            recipientKeyId: envelope.recipientKeyId,
            keyEpoch: envelope.keyEpoch,
          }),
        ),
      ),
    },
    contentKey,
    buffer(fromBase64Url(envelope.ciphertext)),
  );

  return roomPlaintextSchema.parse(
    JSON.parse(textDecoder.decode(new Uint8Array(plaintext))),
  );
}

export async function signRoomKeyManifest(
  input: Readonly<{
    body: RoomKeyManifestBody;
    trustAnchorKeyId: string;
    trustAnchorPrivateKey: CryptoKey;
    crypto?: Crypto;
  }>,
): Promise<RoomKeyManifest> {
  const signature = new Uint8Array(
    await subtle(input.crypto).sign(
      { name: "ECDSA", hash: "SHA-256" },
      input.trustAnchorPrivateKey,
      buffer(textEncoder.encode(canonicalRoomKeyManifestPayload(input.body))),
    ),
  );
  return roomKeyManifestSchema.parse({
    ...input.body,
    signature: {
      algorithm: ROOM_MANIFEST_SIGNATURE_ALGORITHM,
      keyId: input.trustAnchorKeyId,
      value: toBase64Url(signature),
    },
  });
}

/**
 * Fails closed: an unparsable manifest, an unpinned trust anchor, a bad
 * signature or an expired validity window all reject before the submitter can
 * enter sensitive text. The caller must not fall back to an unverified key.
 */
export async function verifyRoomKeyManifest(
  input: Readonly<{
    manifest: unknown;
    trustAnchorKeyId: string;
    trustAnchorPublicKey: string;
    at?: Date;
    crypto?: Crypto;
  }>,
): Promise<RoomKeyManifestBody> {
  const parsed = roomKeyManifestSchema.safeParse(input.manifest);
  if (!parsed.success) {
    throw new Error("Room key manifest is malformed");
  }
  const { signature, ...body } = parsed.data;
  if (signature.keyId !== input.trustAnchorKeyId) {
    throw new Error("Room key manifest is not signed by the pinned anchor");
  }

  const anchor = await subtle(input.crypto).importKey(
    "raw",
    buffer(fromBase64Url(input.trustAnchorPublicKey)),
    SIGNING_CURVE,
    false,
    ["verify"],
  );
  const valid = await subtle(input.crypto).verify(
    { name: "ECDSA", hash: "SHA-256" },
    anchor,
    buffer(fromBase64Url(signature.value)),
    buffer(textEncoder.encode(canonicalRoomKeyManifestPayload(body))),
  );
  if (!valid) {
    throw new Error("Room key manifest signature is invalid");
  }

  const at = (input.at ?? new Date()).getTime();
  if (Date.parse(body.issuedAt) > at || Date.parse(body.expiresAt) <= at) {
    throw new Error("Room key manifest is outside its validity window");
  }
  return body;
}
