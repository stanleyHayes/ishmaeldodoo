import type { ClientSession, Db, Document } from "mongodb";
import { isDeepStrictEqual } from "node:util";
import type { ContentKind, Locale } from "../domain/types";
import type { Publication } from "../domain/workflow";

export const structuredCollectionByKind = {
  identity: "identities",
  atlasNode: "atlas_nodes",
  speakingTheme: "speaking_themes",
  signal: "signals",
  archiveItem: "archive_items",
  source: "sources",
  scholar: "scholars",
  officeHoursCycle: "office_hours_cycles",
  officeHoursAnswer: "office_hours_answers",
  selahEntry: "selah_entries",
  riderTemplate: "rider_templates",
  emailTemplate: "email_templates",
  page: "pages",
  blackout: "blackouts",
  counterparty: "counterparties",
  deskConfiguration: "desk_configurations",
} as const satisfies Record<ContentKind, string>;

export const structuredProjectionCollections = [
  ...new Set(Object.values(structuredCollectionByKind)),
] as readonly string[];

export type StructuredPublicationSlot = Readonly<{
  version: number;
  publishedAt: Date;
  data: unknown;
}>;

export type StructuredPublicationProjection = Readonly<{
  stableId: string;
  documentType: ContentKind;
  data: unknown;
  locales: Partial<Record<Locale, StructuredPublicationSlot>>;
  schemaVersion: 2;
  projectionManaged: true;
  createdAt: Date;
  updatedAt: Date;
}>;

export type StructuredProjectionIntegrity = Readonly<{
  status: "valid" | "invalid" | "incomplete";
  checkedPublications: number;
  checkedProjections: number;
  issues: readonly string[];
}>;

function preferredData(
  locales: Partial<Record<Locale, StructuredPublicationSlot>>,
): unknown {
  return locales["en-GB"]?.data ?? locales["fr-FR"]?.data;
}

function identityRootData(
  documentType: ContentKind,
  data: unknown,
): Record<string, unknown> {
  return documentType === "identity" && data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : {};
}

export async function materializeStructuredPublication(
  database: Db,
  publication: Publication,
  payload: unknown,
  session?: ClientSession,
): Promise<void> {
  const collection = database.collection<StructuredPublicationProjection>(
    structuredCollectionByKind[publication.documentType],
  );
  const current = await collection.findOne(
    { stableId: publication.documentId },
    session ? { session } : {},
  );
  const locales = {
    ...(current?.locales ?? {}),
    [publication.locale]: {
      version: publication.version,
      publishedAt: publication.publishedAt,
      data: payload,
    },
  };
  const data = preferredData(locales);
  const now = publication.publishedAt;
  const projection: StructuredPublicationProjection & Document = {
    ...identityRootData(publication.documentType, data),
    stableId: publication.documentId,
    documentType: publication.documentType,
    data,
    locales,
    schemaVersion: 2,
    projectionManaged: true,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  const filter =
    publication.documentType === "identity" &&
    data &&
    typeof data === "object" &&
    "singletonKey" in data
      ? {
          $or: [
            { stableId: publication.documentId },
            {
              stableId: { $exists: false },
              singletonKey: data.singletonKey,
            },
          ],
        }
      : { stableId: publication.documentId };
  await collection.replaceOne(filter, projection, {
    upsert: true,
    ...(session ? { session } : {}),
  });
}

export async function removeStructuredPublicationLocale(
  database: Db,
  publication: Publication,
  now: Date,
  session?: ClientSession,
): Promise<void> {
  const collection = database.collection<StructuredPublicationProjection>(
    structuredCollectionByKind[publication.documentType],
  );
  const current = await collection.findOne(
    { stableId: publication.documentId },
    session ? { session } : {},
  );
  if (!current) throw new Error("Structured publication projection is missing");
  const locales = { ...current.locales };
  delete locales[publication.locale];
  const data = preferredData(locales);
  if (data === undefined) {
    await collection.deleteOne(
      { stableId: publication.documentId },
      session ? { session } : {},
    );
    return;
  }
  await collection.replaceOne(
    { stableId: publication.documentId },
    {
      ...identityRootData(publication.documentType, data),
      stableId: publication.documentId,
      documentType: publication.documentType,
      data,
      locales,
      schemaVersion: 2,
      projectionManaged: true,
      createdAt: current.createdAt,
      updatedAt: now,
    },
    session ? { session } : {},
  );
}

export async function verifyStructuredPublicationProjections(
  database: Db,
  limit = 10_000,
): Promise<StructuredProjectionIntegrity> {
  const publications = await database
    .collection<Publication>("publications")
    .find({})
    .limit(limit + 1)
    .toArray();
  if (publications.length > limit)
    return {
      status: "incomplete",
      checkedPublications: limit,
      checkedProjections: 0,
      issues: [`Publication count exceeds verification limit ${limit}`],
    };
  const issues: string[] = [];
  const expectedSlots = new Set<string>();
  for (const publication of publications) {
    const key = `${publication.documentType}/${publication.documentId}/${publication.locale}`;
    expectedSlots.add(key);
    const projection = await database
      .collection<StructuredPublicationProjection>(
        structuredCollectionByKind[publication.documentType],
      )
      .findOne({ stableId: publication.documentId });
    const slot = projection?.locales[publication.locale];
    const version = await database
      .collection<{ payload: unknown }>("content_versions")
      .findOne({
        documentType: publication.documentType,
        documentId: publication.documentId,
        version: publication.version,
      });
    if (!projection) issues.push(`${key}: projection missing`);
    else if (!projection.projectionManaged || projection.schemaVersion !== 2)
      issues.push(`${key}: projection metadata is invalid`);
    if (!slot) issues.push(`${key}: locale slot missing`);
    else {
      if (slot.version !== publication.version)
        issues.push(
          `${key}: expected version ${publication.version}, found ${slot.version}`,
        );
      if (!version || !isDeepStrictEqual(slot.data, version.payload))
        issues.push(
          `${key}: locale payload does not match the exact published version`,
        );
    }
  }
  let checkedProjections = 0;
  for (const [documentType, collectionName] of Object.entries(
    structuredCollectionByKind,
  ) as [ContentKind, string][]) {
    const projections = await database
      .collection<StructuredPublicationProjection>(collectionName)
      .find({ projectionManaged: true })
      .limit(limit + 1)
      .toArray();
    checkedProjections += projections.length;
    if (checkedProjections > limit) {
      issues.push(`Projection count exceeds verification limit ${limit}`);
      return {
        status: "incomplete",
        checkedPublications: publications.length,
        checkedProjections: limit,
        issues,
      };
    }
    for (const projection of projections)
      for (const locale of Object.keys(projection.locales) as Locale[]) {
        const key = `${documentType}/${projection.stableId}/${locale}`;
        if (!expectedSlots.has(key)) issues.push(`${key}: orphan locale slot`);
      }
  }
  return {
    status: issues.length === 0 ? "valid" : "invalid",
    checkedPublications: publications.length,
    checkedProjections,
    issues,
  };
}
