import type { Db } from "mongodb";
import type { MongoMigration } from "../types";

const withLongFormTitle = (path: string): Record<string, unknown> => ({
  $map: {
    input: { $ifNull: [`$${path}`, []] },
    as: "title",
    in: {
      $mergeObjects: [
        "$$title",
        {
          longFormTitle: {
            $ifNull: ["$$title.longFormTitle", "$$title.title"],
          },
        },
      ],
    },
  },
});

export const identityTitleHistoryMigration: MongoMigration = {
  id: "20260810_023_identity_title_history",
  description:
    "Add a compatibility long-form title to legacy canonical identity history",
  async up(db: Db) {
    await db
      .collection("identities")
      .updateMany({ titleHistory: { $type: "array" } }, [
        { $set: { titleHistory: withLongFormTitle("titleHistory") } },
      ]);
    await db.collection("content_versions").updateMany(
      {
        documentType: "identity",
        "payload.titleHistory": { $type: "array" },
      },
      [
        {
          $set: {
            "payload.titleHistory": withLongFormTitle("payload.titleHistory"),
          },
        },
      ],
    );
  },
};
