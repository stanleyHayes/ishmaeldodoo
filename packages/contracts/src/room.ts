import { z } from "zod";

/**
 * The Room (F13) confidential channel contract.
 *
 * The browser encrypts to an approved recipient public key before transmission;
 * the API stores ciphertext plus purpose-limited routing metadata only. Nothing
 * in this file may carry a plaintext subject, organisation, filename, MIME
 * description or email address: those belong inside the encrypted payload.
 *
 * Traced to `docs/security/the-room-threat-model.md` and
 * `docs/security/room-cryptography-adr.md`.
 */

/** Suite v1. Chosen for universal WebCrypto availability; see the ADR. */
export const ROOM_ENVELOPE_SUITE = "ECDH-P256-HKDF-SHA256-AES256GCM" as const;
export const ROOM_MANIFEST_SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256" as const;
export const ROOM_RECIPIENT_KEY_ALGORITHM = "ECDH-P256" as const;
export const ROOM_ENVELOPE_VERSION = 1 as const;
export const ROOM_MANIFEST_VERSION = 1 as const;
export const ROOM_ENVELOPE_PURPOSE = "room-enquiry" as const;

/** HKDF context. Bound into key derivation so a key cannot be reused elsewhere. */
export const ROOM_HKDF_INFO = "amanor-room-v1" as const;

/**
 * Plaintext bound enforced in the browser before encryption, and ciphertext
 * bound enforced at ingress. Both exist so neither side is trusted alone.
 */
export const ROOM_PLAINTEXT_MAX_BYTES = 8_192;
export const ROOM_CIPHERTEXT_MAX_CHARACTERS = 12_000;

/** Raw P-256 public point (65 bytes) encoded base64url without padding. */
const base64Url = (bytes: number) =>
  z
    .string()
    .length(Math.ceil((bytes * 4) / 3))
    .regex(/^[A-Za-z0-9_-]+$/u);

const isoDateTime = z.iso.datetime();

export const roomRecipientKeyStatuses = ["active", "retiring"] as const;
export type RoomRecipientKeyStatus = (typeof roomRecipientKeyStatuses)[number];

export const roomRecipientKeySchema = z.object({
  keyId: z.string().regex(/^rk-[0-9a-z][0-9a-z-]{4,47}$/u),
  epoch: z.number().int().positive(),
  algorithm: z.literal(ROOM_RECIPIENT_KEY_ALGORITHM),
  purpose: z.literal(ROOM_ENVELOPE_PURPOSE),
  /** Raw uncompressed P-256 point, 65 bytes. */
  publicKey: base64Url(65),
  notBefore: isoDateTime,
  notAfter: isoDateTime,
  status: z.enum(roomRecipientKeyStatuses),
});
export type RoomRecipientKey = z.infer<typeof roomRecipientKeySchema>;

export const roomKeyManifestBodySchema = z.object({
  manifestVersion: z.literal(ROOM_MANIFEST_VERSION),
  issuedAt: isoDateTime,
  expiresAt: isoDateTime,
  /** At most two live recipients: the Principal and one designate. */
  keys: z.array(roomRecipientKeySchema).min(1).max(2),
});
export type RoomKeyManifestBody = z.infer<typeof roomKeyManifestBodySchema>;

export const roomKeyManifestSchema = roomKeyManifestBodySchema.extend({
  signature: z.object({
    algorithm: z.literal(ROOM_MANIFEST_SIGNATURE_ALGORITHM),
    /** Trust-anchor key identity, pinned in the public bundle. */
    keyId: z.string().regex(/^ta-[0-9a-z][0-9a-z-]{4,47}$/u),
    /** Raw ECDSA P-256 r||s signature, 64 bytes. */
    value: base64Url(64),
  }),
});
export type RoomKeyManifest = z.infer<typeof roomKeyManifestSchema>;

/**
 * Deterministic signing input. Both the signer and every browser verifier must
 * produce identical bytes, so field order is fixed here rather than left to
 * `JSON.stringify` key ordering at the call site.
 */
export function canonicalRoomKeyManifestPayload(
  body: RoomKeyManifestBody,
): string {
  return JSON.stringify([
    "amanor-room-manifest-v1",
    body.manifestVersion,
    body.issuedAt,
    body.expiresAt,
    body.keys.map((key) => [
      key.keyId,
      key.epoch,
      key.algorithm,
      key.purpose,
      key.publicKey,
      key.notBefore,
      key.notAfter,
      key.status,
    ]),
  ]);
}

/**
 * Associated data is deliberately reference-independent: it binds purpose,
 * version, suite and recipient key, but never the envelope or receipt
 * identifier, so ciphertext stays unlinkable to public state.
 */
export function roomEnvelopeAssociatedData(
  input: Readonly<{ recipientKeyId: string; keyEpoch: number }>,
): string {
  return [
    "amanor-room-v1",
    ROOM_ENVELOPE_PURPOSE,
    String(ROOM_ENVELOPE_VERSION),
    ROOM_ENVELOPE_SUITE,
    input.recipientKeyId,
    String(input.keyEpoch),
  ].join("\n");
}

export const roomEnvelopeSchema = z.object({
  envelopeVersion: z.literal(ROOM_ENVELOPE_VERSION),
  suite: z.literal(ROOM_ENVELOPE_SUITE),
  /** 128-bit random identifier; the browser never derives it from content. */
  envelopeId: z.string().regex(/^[0-9a-f]{32}$/u),
  recipientKeyId: roomRecipientKeySchema.shape.keyId,
  keyEpoch: z.number().int().positive(),
  /** Fresh per submission. */
  ephemeralPublicKey: base64Url(65),
  nonce: base64Url(12),
  ciphertext: z
    .string()
    .min(24)
    .max(ROOM_CIPHERTEXT_MAX_CHARACTERS)
    .regex(/^[A-Za-z0-9_-]+$/u),
});
export type RoomEnvelope = z.infer<typeof roomEnvelopeSchema>;

/**
 * Minimal routing metadata. `locale` selects the reference-only notification
 * and receipt language; the acknowledgements record that the submitter was
 * shown the confidentiality and procurement-prohibition notices.
 */
export const roomSubmissionSchema = z.object({
  envelope: roomEnvelopeSchema,
  locale: z.enum(["en-GB", "fr-FR"]),
  confidentialityAcknowledged: z.literal(true),
  procurementAcknowledged: z.literal(true),
});
export type RoomSubmission = z.infer<typeof roomSubmissionSchema>;

export const roomReceiptSchema = z.object({
  /** Unpredictable, non-sequential and not derived from any content. */
  reference: z.string().regex(/^RM-[0-9]{4}-[A-Z2-7]{16}$/u),
  status: z.literal("received"),
  /** Default 180-day deletion deadline, shown to the submitter. */
  deleteAfter: isoDateTime,
});
export type RoomReceipt = z.infer<typeof roomReceiptSchema>;

/**
 * The encrypted payload shape. It exists only inside the AEAD ciphertext and is
 * never persisted or logged in this form by the API.
 */
export const roomPlaintextSchema = z.object({
  subject: z.string().trim().min(4).max(160),
  message: z.string().trim().min(20).max(4_000),
  fromName: z.string().trim().min(2).max(120),
  fromEmail: z.email().max(254),
  organisation: z.string().trim().min(2).max(160).optional(),
});
export type RoomPlaintext = z.infer<typeof roomPlaintextSchema>;

/* ------------------------------------------------------------------ */
/* Restricted operator surface. Metadata only; no plaintext derivative. */
/* ------------------------------------------------------------------ */

export const roomEnquiryStates = [
  "received",
  "read",
  "actioned",
  "quarantined",
] as const;
export type RoomEnquiryState = (typeof roomEnquiryStates)[number];

export const roomInboxItemSchema = z.object({
  reference: roomReceiptSchema.shape.reference,
  state: z.enum(roomEnquiryStates),
  locale: z.enum(["en-GB", "fr-FR"]),
  recipientKeyId: roomRecipientKeySchema.shape.keyId,
  keyEpoch: z.number().int().positive(),
  receivedAt: isoDateTime,
  deleteAfter: isoDateTime,
  extensionCount: z.number().int().nonnegative(),
  ciphertextBytes: z.number().int().positive(),
});
export type RoomInboxItem = z.infer<typeof roomInboxItemSchema>;

export const roomInboxPageSchema = z.object({
  items: z.array(roomInboxItemSchema).max(50),
  total: z.number().int().nonnegative(),
});
export type RoomInboxPage = z.infer<typeof roomInboxPageSchema>;

/** Ciphertext released to the restricted client for local decryption. */
export const roomCiphertextSchema = z.object({
  reference: roomReceiptSchema.shape.reference,
  envelope: roomEnvelopeSchema,
  receivedAt: isoDateTime,
  deleteAfter: isoDateTime,
});
export type RoomCiphertext = z.infer<typeof roomCiphertextSchema>;

/** Free-text reasons are forbidden; only these categories are recorded. */
export const roomExtensionReasons = [
  "active_conversation",
  "legal_hold",
  "security_investigation",
] as const;
export type RoomExtensionReason = (typeof roomExtensionReasons)[number];

export const ROOM_RETENTION_DAYS = 180;
export const ROOM_EXTENSION_MAX_DAYS = 180;
export const ROOM_EXTENSION_MAX_COUNT = 2;

export const roomExtensionSchema = z.object({
  reason: z.enum(roomExtensionReasons),
  days: z.number().int().positive().max(ROOM_EXTENSION_MAX_DAYS),
});
export type RoomExtension = z.infer<typeof roomExtensionSchema>;

export const roomStateChangeSchema = z.object({
  state: z.enum(["read", "actioned", "quarantined"]),
});
export type RoomStateChange = z.infer<typeof roomStateChangeSchema>;

/** Metadata-only audit actions. */
export const roomAuditActions = [
  "room_enquiry_received",
  "room_ciphertext_released",
  "room_state_changed",
  "room_retention_extended",
  "room_enquiry_deleted",
  "room_deletion_failed",
  "room_designation_granted",
  "room_designation_revoked",
  "room_access_denied",
] as const;
export type RoomAuditAction = (typeof roomAuditActions)[number];

export const roomAuditEventSchema = z.object({
  action: z.enum(roomAuditActions),
  actorId: z.string().nullable(),
  reference: roomReceiptSchema.shape.reference.nullable(),
  keyId: roomRecipientKeySchema.shape.keyId.nullable(),
  reasonCategory: z.enum(roomExtensionReasons).nullable(),
  occurredAt: isoDateTime,
});
export type RoomAuditEvent = z.infer<typeof roomAuditEventSchema>;

export const roomDesignationSchema = z.object({
  userId: z.string().min(1).max(64),
  expiresAt: isoDateTime,
});
export type RoomDesignation = z.infer<typeof roomDesignationSchema>;

export const roomDesignationStateSchema = z.object({
  designate: z
    .object({
      userId: z.string(),
      grantedAt: isoDateTime,
      expiresAt: isoDateTime,
      active: z.boolean(),
    })
    .nullable(),
});
export type RoomDesignationState = z.infer<typeof roomDesignationStateSchema>;
