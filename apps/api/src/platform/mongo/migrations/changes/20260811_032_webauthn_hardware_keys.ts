import type { MongoMigration } from "../types";

export const webAuthnHardwareKeysMigration: MongoMigration = {
  id: "20260811_032_webauthn_hardware_keys",
  description:
    "Create single-use WebAuthn ceremonies and hardware-key credentials",
  async up(db) {
    const ceremonies = db.collection("webauthn_challenges");
    await ceremonies.createIndex({ ceremonyId: 1 }, { unique: true });
    await ceremonies.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await ceremonies.createIndex({
      userId: 1,
      sessionId: 1,
      purpose: 1,
      usedAt: 1,
    });
    const credentials = db.collection("webauthn_credentials");
    await credentials.createIndex({ credentialId: 1 }, { unique: true });
    await credentials.createIndex({ userId: 1, revokedAt: 1, createdAt: 1 });
  },
};
