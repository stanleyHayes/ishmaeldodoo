import type { MongoMigration } from "../types";

const missingEvidence = {
  bio40SourceRefs: { $exists: false },
  bio120SourceRefs: { $exists: false },
  bio300SourceRefs: { $exists: false },
} as const;

export const biographySourcesMigration: MongoMigration = {
  id: "20260810_016_biography_sources",
  description:
    "Add explicit evidence arrays to canonical biography fields without fabricating source links",
  async up(db) {
    await db.collection("identities").updateMany(
      {
        $or: Object.entries(missingEvidence).map(([field, condition]) => ({
          [field]: condition,
        })),
      },
      {
        $set: {
          bio40SourceRefs: [],
          bio120SourceRefs: [],
          bio300SourceRefs: [],
        },
      },
    );
    await db.collection("content_versions").updateMany(
      {
        documentType: "identity",
        $or: Object.entries(missingEvidence).map(([field, condition]) => ({
          [`payload.${field}`]: condition,
        })),
      },
      {
        $set: {
          "payload.bio40SourceRefs": [],
          "payload.bio120SourceRefs": [],
          "payload.bio300SourceRefs": [],
        },
      },
    );
  },
};
