import type { MongoMigration } from "../types";

export const authInvitationsMigration: MongoMigration = {
  id: "20260810_009_auth_invitations",
  description: "Enforce unique one-time administrator invitation token hashes",
  async up(db) {
    await db
      .collection("users")
      .createIndex({ invitationTokenHash: 1 }, { unique: true, sparse: true });
  },
};
