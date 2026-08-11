import { describe, expect, it } from "vitest";
import {
  ROOM_CIPHERTEXT_MAX_CHARACTERS,
  ROOM_ENVELOPE_SUITE,
  canonicalRoomKeyManifestPayload,
  roomEnvelopeAssociatedData,
  roomEnvelopeSchema,
  roomKeyManifestSchema,
  roomReceiptSchema,
  roomSubmissionSchema,
  type RoomKeyManifestBody,
} from "./room.js";

const base64Url = (bytes: number, fill = "A") =>
  fill.repeat(Math.ceil((bytes * 4) / 3));

const envelope = {
  envelopeVersion: 1 as const,
  suite: ROOM_ENVELOPE_SUITE,
  envelopeId: "0123456789abcdef0123456789abcdef",
  recipientKeyId: "rk-principal-2026",
  keyEpoch: 3,
  ephemeralPublicKey: base64Url(65),
  nonce: base64Url(12),
  ciphertext: base64Url(64),
};

const manifestBody: RoomKeyManifestBody = {
  manifestVersion: 1,
  issuedAt: "2026-08-10T00:00:00.000Z",
  expiresAt: "2026-09-10T00:00:00.000Z",
  keys: [
    {
      keyId: "rk-principal-2026",
      epoch: 3,
      algorithm: "ECDH-P256",
      purpose: "room-enquiry",
      publicKey: base64Url(65, "B"),
      notBefore: "2026-08-01T00:00:00.000Z",
      notAfter: "2027-08-01T00:00:00.000Z",
      status: "active",
    },
  ],
};

describe("room envelope contract", () => {
  it("accepts a well-formed envelope", () => {
    expect(roomEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it.each([
    ["a truncated ephemeral key", { ephemeralPublicKey: base64Url(32) }],
    ["a reused-length nonce", { nonce: base64Url(16) }],
    ["a content-derived envelope id", { envelopeId: "not-hexadecimal" }],
    ["an unknown suite", { suite: "AES-128-CBC" }],
    ["an unknown envelope version", { envelopeVersion: 2 }],
    ["a non-positive key epoch", { keyEpoch: 0 }],
    [
      "an oversized ciphertext",
      { ciphertext: "A".repeat(ROOM_CIPHERTEXT_MAX_CHARACTERS + 1) },
    ],
    ["a non-base64url ciphertext", { ciphertext: "not base64url!!" }],
  ])("rejects %s", (_label, override) => {
    expect(
      roomEnvelopeSchema.safeParse({ ...envelope, ...override }).success,
    ).toBe(false);
  });
});

describe("room associated data", () => {
  it("binds purpose, version, suite and recipient key", () => {
    const associated = roomEnvelopeAssociatedData({
      recipientKeyId: envelope.recipientKeyId,
      keyEpoch: envelope.keyEpoch,
    });
    expect(associated).toContain("room-enquiry");
    expect(associated).toContain(ROOM_ENVELOPE_SUITE);
    expect(associated).toContain(envelope.recipientKeyId);
    expect(associated).toContain("3");
  });

  it("stays reference-independent so ciphertext is unlinkable to public state", () => {
    const associated = roomEnvelopeAssociatedData({
      recipientKeyId: envelope.recipientKeyId,
      keyEpoch: envelope.keyEpoch,
    });
    expect(associated).not.toContain(envelope.envelopeId);
  });

  it("changes when the recipient key or epoch changes", () => {
    const base = roomEnvelopeAssociatedData({
      recipientKeyId: "rk-principal-2026",
      keyEpoch: 3,
    });
    expect(
      roomEnvelopeAssociatedData({
        recipientKeyId: "rk-designate-2026",
        keyEpoch: 3,
      }),
    ).not.toBe(base);
    expect(
      roomEnvelopeAssociatedData({
        recipientKeyId: "rk-principal-2026",
        keyEpoch: 4,
      }),
    ).not.toBe(base);
  });
});

describe("room key manifest contract", () => {
  it("produces a deterministic signing payload regardless of key insertion order", () => {
    const reordered: RoomKeyManifestBody = {
      keys: manifestBody.keys,
      expiresAt: manifestBody.expiresAt,
      issuedAt: manifestBody.issuedAt,
      manifestVersion: manifestBody.manifestVersion,
    };
    expect(canonicalRoomKeyManifestPayload(reordered)).toBe(
      canonicalRoomKeyManifestPayload(manifestBody),
    );
  });

  it("changes the signing payload when a public key is substituted", () => {
    const substituted: RoomKeyManifestBody = {
      ...manifestBody,
      keys: [{ ...manifestBody.keys[0]!, publicKey: base64Url(65, "C") }],
    };
    expect(canonicalRoomKeyManifestPayload(substituted)).not.toBe(
      canonicalRoomKeyManifestPayload(manifestBody),
    );
  });

  it("caps live recipients at the Principal plus one designate", () => {
    const third = { ...manifestBody.keys[0]!, keyId: "rk-third-2026" };
    expect(
      roomKeyManifestSchema.safeParse({
        ...manifestBody,
        keys: [manifestBody.keys[0]!, third, third],
        signature: {
          algorithm: "ECDSA-P256-SHA256",
          keyId: "ta-room-2026",
          value: base64Url(64),
        },
      }).success,
    ).toBe(false);
  });

  it("requires a signature", () => {
    expect(roomKeyManifestSchema.safeParse(manifestBody).success).toBe(false);
  });
});

describe("room submission contract", () => {
  const submission = {
    envelope,
    locale: "en-GB" as const,
    confidentialityAcknowledged: true as const,
    procurementAcknowledged: true as const,
  };

  it("accepts minimal routing metadata only", () => {
    expect(roomSubmissionSchema.safeParse(submission).success).toBe(true);
  });

  it("refuses a submission without the procurement acknowledgement", () => {
    expect(
      roomSubmissionSchema.safeParse({
        ...submission,
        procurementAcknowledged: false,
      }).success,
    ).toBe(false);
  });

  it("strips any plaintext identity smuggled alongside the envelope", () => {
    const parsed = roomSubmissionSchema.parse({
      ...submission,
      subject: "Sahel facility",
      fromEmail: "someone@example.org",
      organisation: "Example Bank",
    });
    expect(parsed).not.toHaveProperty("subject");
    expect(parsed).not.toHaveProperty("fromEmail");
    expect(parsed).not.toHaveProperty("organisation");
  });
});

describe("room receipt contract", () => {
  it("accepts an unpredictable non-sequential reference", () => {
    expect(
      roomReceiptSchema.safeParse({
        reference: "RM-2026-A2B3C4D5E6F7G2H3",
        status: "received",
        deleteAfter: "2027-02-06T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it.each(["RM-2026-000001", "RM-2026-a2b3c4d5e6f7g2h3", "GC-2026-A2B3C4D5"])(
    "rejects %s",
    (reference) => {
      expect(
        roomReceiptSchema.safeParse({
          reference,
          status: "received",
          deleteAfter: "2027-02-06T00:00:00.000Z",
        }).success,
      ).toBe(false);
    },
  );
});
