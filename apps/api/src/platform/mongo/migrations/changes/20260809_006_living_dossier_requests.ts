import type { MongoMigration } from "../types";

export const livingDossierRequestsMigration: MongoMigration = {
  id: "20260809_006_living_dossier_requests",
  description: "Create bounded Living Dossier generation and retention indexes",
  async up(db) {
    await db
      .collection("living_dossier_requests")
      .createIndex({ requestId: 1 }, { unique: true });
    await db
      .collection("living_dossier_requests")
      .createIndex({ generatedAt: -1 });
    await db
      .collection("living_dossier_requests")
      .createIndex({ variant: 1, generatedAt: -1 });
    await db
      .collection("living_dossier_requests")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  },
};
