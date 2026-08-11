import type { Document } from "mongodb";
import {
  materializeStructuredPublication,
  structuredProjectionCollections,
} from "../../../../modules/content/persistence/structured-publication-projection";
import type { ContentKind } from "../../../../modules/content/domain/types";
import type { Publication } from "../../../../modules/content/domain/workflow";
import type { MongoMigration } from "../types";

type PersistedVersion = Readonly<{
  documentType: ContentKind;
  documentId: string;
  version: number;
  payload: unknown;
}>;

export const structuredPublicationProjectionsMigration: MongoMigration = {
  id: "20260810_025_structured_publication_projections",
  description:
    "Rebuild named structured collections from exact CMS publication pointers",
  async up(db) {
    const archivedAt = new Date();
    const archive = db.collection<{
      sourceCollection: string;
      archivedAt: Date;
      original: Document;
    }>("structured_projection_legacy");
    for (const collectionName of structuredProjectionCollections) {
      const collection = db.collection(collectionName);
      for await (const original of collection.find({}))
        await archive.insertOne({
          sourceCollection: collectionName,
          archivedAt,
          original,
        });
      await collection.deleteMany({});
    }
    await archive.createIndex(
      { sourceCollection: 1, archivedAt: 1 },
      { name: "sourceCollection_archivedAt" },
    );

    const publications = await db
      .collection<Publication>("publications")
      .find({})
      .sort({ documentType: 1, documentId: 1, locale: 1 })
      .toArray();
    for (const publication of publications) {
      const version = await db
        .collection<PersistedVersion>("content_versions")
        .findOne({
          documentType: publication.documentType,
          documentId: publication.documentId,
          version: publication.version,
        });
      if (!version)
        throw new Error(
          `Cannot materialize ${publication.documentType}/${publication.documentId}/${publication.locale}: version ${publication.version} is missing`,
        );
      await materializeStructuredPublication(db, publication, version.payload);
    }
  },
};
