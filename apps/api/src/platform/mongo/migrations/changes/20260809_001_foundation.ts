import type { MongoMigration } from "../types";

export const foundationMigration: MongoMigration = {
  id: "20260809_001_foundation",
  description:
    "Create foundational identity, content, editorial, auth and operations indexes",
  async up(db) {
    await db
      .collection("identities")
      .createIndex({ singletonKey: 1 }, { unique: true });
    await db.collection("sources").createIndex({ ref: 1 }, { unique: true });
    await db
      .collection("atlas_nodes")
      .createIndex({ slug: 1 }, { unique: true });
    await db
      .collection("atlas_nodes")
      .createIndex({ location: "2dsphere" }, { sparse: true });
    await db
      .collection("archive_items")
      .createIndex({ slug: 1 }, { unique: true });
    await db
      .collection("speaking_themes")
      .createIndex({ slug: 1 }, { unique: true });
    await db.collection("signals").createIndex({ slug: 1 }, { unique: true });
    await db
      .collection("scholars")
      .createIndex({ consentStatus: 1, cohortYear: -1 });
    await db.collection("pages").createIndex({ slug: 1 }, { unique: true });
    await db
      .collection("content_versions")
      .createIndex(
        { documentType: 1, documentId: 1, version: 1 },
        { unique: true },
      );
    await db.collection("content_versions").createIndex({ createdAt: -1 });
    await db
      .collection("publications")
      .createIndex(
        { documentType: 1, documentId: 1, locale: 1 },
        { unique: true },
      );
    await db.collection("editorial_audit").createIndex({ occurredAt: -1 });
    await db
      .collection("editorial_audit")
      .createIndex({ documentId: 1, occurredAt: -1 });
    await db
      .collection("outbox_jobs")
      .createIndex({ status: 1, availableAt: 1 });
    await db
      .collection("outbox_jobs")
      .createIndex({ idempotencyKey: 1 }, { unique: true });
    await db
      .collection("sessions")
      .createIndex({ sessionId: 1 }, { unique: true });
    await db
      .collection("sessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  },
};
