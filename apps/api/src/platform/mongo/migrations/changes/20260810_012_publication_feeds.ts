import type { MongoMigration } from "../types";

export const publicationFeedsMigration: MongoMigration = {
  id: "20260810_012_publication_feeds",
  description: "Index locale publication feeds by newest publication",
  async up(db) {
    await db.collection("publications").createIndex({
      documentType: 1,
      locale: 1,
      publishedAt: -1,
      documentId: 1,
    });
  },
};
