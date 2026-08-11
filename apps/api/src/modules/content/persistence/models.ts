import { Schema, model, models } from "mongoose";

const translationStatusSchema = new Schema(
  {
    "en-GB": {
      type: String,
      enum: ["current", "stale", "missing"],
      required: true,
    },
    "fr-FR": {
      type: String,
      enum: ["current", "stale", "missing"],
      required: true,
    },
  },
  { _id: false },
);

export const localizedTextMongooseSchema = new Schema(
  {
    "en-GB": { type: String, required: true },
    "fr-FR": { type: String, default: "" },
    status: { type: translationStatusSchema, required: true },
    sourceUpdatedAt: { type: Date, required: true },
  },
  { _id: false },
);

export const contentVersionSchema = new Schema(
  {
    documentType: { type: String, required: true, index: true },
    documentId: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    state: {
      type: String,
      enum: [
        "draft",
        "in_review",
        "approved",
        "scheduled",
        "published",
        "superseded",
      ],
      required: true,
    },
    authorId: { type: String, required: true },
    reviewerId: String,
    approvedAt: Date,
    scheduledFor: Date,
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

contentVersionSchema.index(
  { documentType: 1, documentId: 1, version: 1 },
  { unique: true },
);

export const publicationSchema = new Schema(
  {
    documentType: { type: String, required: true },
    documentId: { type: String, required: true },
    locale: { type: String, enum: ["en-GB", "fr-FR"], required: true },
    version: { type: Number, required: true, min: 1 },
    publishedAt: { type: Date, required: true },
  },
  { timestamps: true },
);
publicationSchema.index(
  { documentType: 1, documentId: 1, locale: 1 },
  { unique: true },
);

export const editorialAuditSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    documentType: { type: String, required: true },
    documentId: { type: String, required: true },
    version: Number,
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    sequence: { type: Number, required: true, min: 1 },
    occurredAt: { type: Date, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    changes: { type: [Schema.Types.Mixed], default: [] },
    previousEventHash: String,
    eventHash: { type: String, required: true },
  },
  { timestamps: false, versionKey: false },
);
editorialAuditSchema.index(
  { documentType: 1, documentId: 1, sequence: 1 },
  { unique: true },
);

export const identityMongooseSchema = new Schema(
  {
    singletonKey: {
      type: String,
      enum: ["canonical"],
      required: true,
      unique: true,
    },
    legalName: { type: String, required: true },
    honorific: { type: String, required: true },
    displayName: { type: String, required: true },
    givenName: String,
    additionalName: String,
    familyName: String,
    shortName: { type: String, required: true },
    familiarName: { type: String, required: true },
    pronunciationGuide: {
      type: localizedTextMongooseSchema,
      required: true,
    },
    pronunciationAudio: String,
    nationality: { type: localizedTextMongooseSchema, required: true },
    languages: { type: [String], required: true },
    location: { type: localizedTextMongooseSchema, required: true },
    titleHistory: { type: [Schema.Types.Mixed], required: true },
    bio40: { type: localizedTextMongooseSchema, required: true },
    bio40SourceRefs: { type: [String], required: true },
    bio120: { type: localizedTextMongooseSchema, required: true },
    bio120SourceRefs: { type: [String], required: true },
    bio300: { type: localizedTextMongooseSchema, required: true },
    bio300SourceRefs: { type: [String], required: true },
    portraits: { type: [String], default: [] },
    sameAs: [String],
    alumniOf: [String],
    knowsAbout: [String],
    disambiguation: localizedTextMongooseSchema,
  },
  { timestamps: true, optimisticConcurrency: true },
);

// Mongoose's model registry preserves each schema's inferred model type at runtime.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function existingOrCreate(name: string, schema: Schema, collection: string) {
  return models[name] ?? model(name, schema, collection);
}

export const ContentVersionModel = existingOrCreate(
  "ContentVersion",
  contentVersionSchema,
  "content_versions",
);
export const PublicationModel = existingOrCreate(
  "Publication",
  publicationSchema,
  "publications",
);
export const EditorialAuditModel = existingOrCreate(
  "EditorialAudit",
  editorialAuditSchema,
  "editorial_audit",
);
export const IdentityModel = existingOrCreate(
  "Identity",
  identityMongooseSchema,
  "identities",
);

const structuredContentSchemas = {
  AtlasNode: "atlas_nodes",
  SpeakingTheme: "speaking_themes",
  Signal: "signals",
  ArchiveItem: "archive_items",
  Source: "sources",
  Scholar: "scholars",
  OfficeHoursCycle: "office_hours_cycles",
  OfficeHoursAnswer: "office_hours_answers",
  SelahEntry: "selah_entries",
  RiderTemplate: "rider_templates",
  EmailTemplate: "email_templates",
  Page: "pages",
  Blackout: "blackouts",
  Counterparty: "counterparties",
  DeskConfiguration: "desk_configurations",
} as const;

const structuredSchema = new Schema(
  {
    stableId: { type: String, required: true },
    documentType: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    locales: {
      type: new Schema(
        {
          "en-GB": Schema.Types.Mixed,
          "fr-FR": Schema.Types.Mixed,
        },
        { _id: false },
      ),
      required: true,
    },
    schemaVersion: { type: Number, required: true, default: 2 },
    projectionManaged: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);
structuredSchema.index({ stableId: 1 }, { unique: true });

export const StructuredContentModels = Object.fromEntries(
  Object.entries(structuredContentSchemas).map(([name, collection]) => [
    name,
    existingOrCreate(name, structuredSchema, collection),
  ]),
);
