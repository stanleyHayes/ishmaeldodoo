import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptRoomEnvelope,
  encryptRoomEnvelope,
  fromBase64Url,
  selectRoomRecipientKey,
  signRoomKeyManifest,
  toBase64Url,
  verifyRoomKeyManifest,
} from "./room-crypto.js";
import type {
  RoomKeyManifestBody,
  RoomPlaintext,
  RoomRecipientKey,
} from "./room.js";

const plaintext: RoomPlaintext = {
  subject: "Lite facility structuring",
  message:
    "We would like a confidential conversation about a blended finance facility and its governance.",
  fromName: "A Counterparty",
  fromEmail: "counterparty@example.org",
  organisation: "Example Development Bank",
};

type Recipient = Readonly<{
  key: RoomRecipientKey;
  privateKey: CryptoKey;
}>;

async function generateRecipient(
  keyId: string,
  epoch: number,
  overrides: Partial<RoomRecipientKey> = {},
): Promise<Recipient> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  return {
    privateKey: pair.privateKey,
    key: {
      keyId,
      epoch,
      algorithm: "ECDH-P256",
      purpose: "room-enquiry",
      publicKey: toBase64Url(raw),
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

let principal: Recipient;
let designate: Recipient;
let anchor: CryptoKeyPair;
let anchorPublicKey: string;

beforeAll(async () => {
  principal = await generateRecipient("rk-principal-2026", 3);
  designate = await generateRecipient("rk-designate-2026", 1);
  anchor = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  anchorPublicKey = toBase64Url(
    new Uint8Array(await crypto.subtle.exportKey("raw", anchor.publicKey)),
  );
});

describe("room envelope encryption", () => {
  it("round-trips only for the holder of the recipient private key", async () => {
    const envelope = await encryptRoomEnvelope({
      plaintext,
      recipient: principal.key,
    });
    expect(envelope.recipientKeyId).toBe("rk-principal-2026");
    expect(envelope.keyEpoch).toBe(3);

    await expect(
      decryptRoomEnvelope({
        envelope,
        recipientPrivateKey: principal.privateKey,
        recipientPublicKey: principal.key.publicKey,
      }),
    ).resolves.toEqual(plaintext);
  });

  it("leaks no plaintext into the transmitted envelope", async () => {
    const envelope = await encryptRoomEnvelope({
      plaintext,
      recipient: principal.key,
    });
    const serialised = JSON.stringify(envelope);
    for (const secret of [
      plaintext.subject,
      plaintext.message,
      plaintext.fromEmail,
      plaintext.fromName,
      plaintext.organisation!,
    ]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it("produces a fresh ephemeral key, nonce and identifier per submission", async () => {
    const [first, second] = await Promise.all([
      encryptRoomEnvelope({ plaintext, recipient: principal.key }),
      encryptRoomEnvelope({ plaintext, recipient: principal.key }),
    ]);
    expect(first.envelopeId).not.toBe(second.envelopeId);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ephemeralPublicKey).not.toBe(second.ephemeralPublicKey);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("refuses a different recipient's private key", async () => {
    const envelope = await encryptRoomEnvelope({
      plaintext,
      recipient: principal.key,
    });
    await expect(
      decryptRoomEnvelope({
        envelope,
        recipientPrivateKey: designate.privateKey,
        recipientPublicKey: designate.key.publicKey,
      }),
    ).rejects.toThrow();
  });

  it("refuses tampered ciphertext", async () => {
    const envelope = await encryptRoomEnvelope({
      plaintext,
      recipient: principal.key,
    });
    const bytes = fromBase64Url(envelope.ciphertext);
    bytes.set([(bytes[0] ?? 0) ^ 0xff], 0);
    await expect(
      decryptRoomEnvelope({
        envelope: { ...envelope, ciphertext: toBase64Url(bytes) },
        recipientPrivateKey: principal.privateKey,
        recipientPublicKey: principal.key.publicKey,
      }),
    ).rejects.toThrow();
  });

  it("refuses an envelope whose declared key epoch was altered in transit", async () => {
    const envelope = await encryptRoomEnvelope({
      plaintext,
      recipient: principal.key,
    });
    await expect(
      decryptRoomEnvelope({
        envelope: { ...envelope, keyEpoch: envelope.keyEpoch + 1 },
        recipientPrivateKey: principal.privateKey,
        recipientPublicKey: principal.key.publicKey,
      }),
    ).rejects.toThrow();
  });

  it("refuses plaintext beyond the permitted length before any transmission", async () => {
    await expect(
      encryptRoomEnvelope({
        plaintext: { ...plaintext, message: "x".repeat(4_001) },
        recipient: principal.key,
      }),
    ).rejects.toThrow();
  });
});

describe("room key manifest signing", () => {
  const body = (keys: readonly RoomRecipientKey[]): RoomKeyManifestBody => ({
    manifestVersion: 1,
    issuedAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-09-01T00:00:00.000Z",
    keys: [...keys] as RoomKeyManifestBody["keys"],
  });
  const at = new Date("2026-08-10T00:00:00.000Z");

  it("verifies a manifest signed by the pinned trust anchor", async () => {
    const manifest = await signRoomKeyManifest({
      body: body([principal.key]),
      trustAnchorKeyId: "ta-room-2026",
      trustAnchorPrivateKey: anchor.privateKey,
    });
    await expect(
      verifyRoomKeyManifest({
        manifest,
        trustAnchorKeyId: "ta-room-2026",
        trustAnchorPublicKey: anchorPublicKey,
        at,
      }),
    ).resolves.toMatchObject({ manifestVersion: 1 });
  });

  it("rejects a substituted recipient public key", async () => {
    const manifest = await signRoomKeyManifest({
      body: body([principal.key]),
      trustAnchorKeyId: "ta-room-2026",
      trustAnchorPrivateKey: anchor.privateKey,
    });
    await expect(
      verifyRoomKeyManifest({
        manifest: {
          ...manifest,
          keys: [{ ...principal.key, publicKey: designate.key.publicKey }],
        },
        trustAnchorKeyId: "ta-room-2026",
        trustAnchorPublicKey: anchorPublicKey,
        at,
      }),
    ).rejects.toThrow(/signature is invalid/iu);
  });

  it("rejects a manifest signed by an unpinned anchor", async () => {
    const hostile = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const manifest = await signRoomKeyManifest({
      body: body([principal.key]),
      trustAnchorKeyId: "ta-room-2026",
      trustAnchorPrivateKey: hostile.privateKey,
    });
    await expect(
      verifyRoomKeyManifest({
        manifest,
        trustAnchorKeyId: "ta-room-2026",
        trustAnchorPublicKey: anchorPublicKey,
        at,
      }),
    ).rejects.toThrow(/signature is invalid/iu);
  });

  it("rejects a manifest attributed to a different anchor identity", async () => {
    const manifest = await signRoomKeyManifest({
      body: body([principal.key]),
      trustAnchorKeyId: "ta-room-2027",
      trustAnchorPrivateKey: anchor.privateKey,
    });
    await expect(
      verifyRoomKeyManifest({
        manifest,
        trustAnchorKeyId: "ta-room-2026",
        trustAnchorPublicKey: anchorPublicKey,
        at,
      }),
    ).rejects.toThrow(/pinned anchor/iu);
  });

  it("fails closed outside the manifest validity window", async () => {
    const manifest = await signRoomKeyManifest({
      body: body([principal.key]),
      trustAnchorKeyId: "ta-room-2026",
      trustAnchorPrivateKey: anchor.privateKey,
    });
    await expect(
      verifyRoomKeyManifest({
        manifest,
        trustAnchorKeyId: "ta-room-2026",
        trustAnchorPublicKey: anchorPublicKey,
        at: new Date("2026-09-02T00:00:00.000Z"),
      }),
    ).rejects.toThrow(/validity window/iu);
  });

  it("rejects a malformed manifest without attempting verification", async () => {
    await expect(
      verifyRoomKeyManifest({
        manifest: { manifestVersion: 1 },
        trustAnchorKeyId: "ta-room-2026",
        trustAnchorPublicKey: anchorPublicKey,
        at,
      }),
    ).rejects.toThrow(/malformed/iu);
  });
});

describe("recipient key selection", () => {
  const at = new Date("2026-08-10T00:00:00.000Z");

  it("prefers the highest active epoch", async () => {
    const older = await generateRecipient("rk-principal-2025", 2);
    const selected = selectRoomRecipientKey(
      {
        manifestVersion: 1,
        issuedAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-09-01T00:00:00.000Z",
        keys: [older.key, principal.key],
      },
      at,
    );
    expect(selected.keyId).toBe("rk-principal-2026");
  });

  it("never offers a retiring key for a new submission", async () => {
    const retiring = await generateRecipient("rk-principal-2025", 9, {
      status: "retiring",
    });
    expect(() =>
      selectRoomRecipientKey(
        {
          manifestVersion: 1,
          issuedAt: "2026-08-01T00:00:00.000Z",
          expiresAt: "2026-09-01T00:00:00.000Z",
          keys: [retiring.key],
        },
        at,
      ),
    ).toThrow(/no room recipient key is valid/iu);
  });

  it("never offers a key outside its own validity window", async () => {
    const future = await generateRecipient("rk-principal-2027", 4, {
      notBefore: "2026-12-01T00:00:00.000Z",
      notAfter: "2027-12-01T00:00:00.000Z",
    });
    expect(() =>
      selectRoomRecipientKey(
        {
          manifestVersion: 1,
          issuedAt: "2026-08-01T00:00:00.000Z",
          expiresAt: "2026-09-01T00:00:00.000Z",
          keys: [future.key],
        },
        at,
      ),
    ).toThrow(/no room recipient key is valid/iu);
  });
});
