import { Schema, model, models } from "mongoose";
import { roles } from "../domain/roles";
import { authenticationMethods } from "../domain/authentication-method";

export const userSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    emailCanonical: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    roles: { type: [String], enum: roles, required: true },
    roleVersion: { type: Number, required: true, default: 1, min: 1 },
    disabledAt: Date,
    invitedAt: Date,
    invitationAcceptedAt: Date,
    invitationTokenHash: { type: String, select: false },
    invitationExpiresAt: Date,
    invitedBy: String,
    passwordChangedAt: Date,
    mfa: {
      encryptedSecret: { type: String, select: false },
      iv: { type: String, select: false },
      authTag: { type: String, select: false },
      recoveryCodeHashes: { type: [String], select: false, default: [] },
      enrolledAt: Date,
      lastUsedStep: Number,
    },
  },
  { timestamps: true, optimisticConcurrency: true },
);
userSchema.index({ invitationTokenHash: 1 }, { unique: true, sparse: true });

export const sessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    roles: { type: [String], enum: roles, required: true },
    roleVersion: { type: Number, required: true },
    currentRefreshHash: { type: String, required: true, select: false },
    csrfHash: { type: String, required: true, select: false },
    authenticationMethods: {
      type: [String],
      enum: authenticationMethods,
      required: true,
      validate: {
        validator: (methods: string[]): boolean =>
          methods.length > 0 && new Set(methods).size === methods.length,
        message: "Authentication methods must be non-empty and unique",
      },
    },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    rotatedAt: Date,
    revokedAt: Date,
    revokeReason: String,
  },
  { timestamps: true, optimisticConcurrency: true },
);

export const authEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    actorId: String,
    subjectId: String,
    sessionId: String,
    occurredAt: { type: Date, required: true },
    ipHash: String,
    userAgentFamily: String,
    outcome: { type: String, enum: ["success", "failure"], required: true },
    reason: String,
    previousEventHash: String,
    eventHash: { type: String, required: true },
    chainSequence: { type: Number, required: true, min: 1 },
  },
  { versionKey: false },
);

export const webAuthnChallengeSchema = new Schema(
  {
    ceremonyId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true },
    purpose: {
      type: String,
      enum: ["registration", "authentication"],
      required: true,
    },
    challengeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export const webAuthnCredentialSchema = new Schema(
  {
    credentialId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    webAuthnUserId: { type: String, required: true },
    publicKey: { type: Buffer, required: true, select: false },
    counter: { type: Number, required: true, min: 0 },
    transports: { type: [String], required: true, default: [] },
    deviceType: {
      type: String,
      enum: ["singleDevice", "multiDevice"],
      required: true,
    },
    backedUp: { type: Boolean, required: true },
    aaguid: { type: String, required: true },
    label: { type: String, required: true, maxlength: 80 },
    lastUsedAt: Date,
    revokedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
authEventSchema.index({ occurredAt: -1 });
authEventSchema.index({ occurredAt: -1, eventId: -1 });
authEventSchema.index({ subjectId: 1, occurredAt: -1 });

export const UserModel = models.User ?? model("User", userSchema, "users");
export const SessionModel =
  models.Session ?? model("Session", sessionSchema, "sessions");
export const AuthEventModel =
  models.AuthEvent ?? model("AuthEvent", authEventSchema, "auth_events");
export const WebAuthnChallengeModel =
  models.WebAuthnChallenge ??
  model("WebAuthnChallenge", webAuthnChallengeSchema, "webauthn_challenges");
export const WebAuthnCredentialModel =
  models.WebAuthnCredential ??
  model("WebAuthnCredential", webAuthnCredentialSchema, "webauthn_credentials");
