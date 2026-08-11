import { z } from "zod";
import { localizedTextSchema } from "../../content/domain/types";

export const mediaFolders = [
  "portraits",
  "atlas",
  "archive",
  "speaking",
  "scholars",
  "press",
] as const;
export const mediaResourceTypes = ["image", "video", "raw"] as const;
export const mediaTransformationPolicies = [
  "portrait",
  "editorial",
  "atlas",
  "document",
] as const;
export const mediaRetentionPolicies = [
  "standard",
  "permanent",
  "expires",
] as const;

const focalPointSchema = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
  .strict();

export const signUploadSchema = z
  .object({
    folder: z.enum(mediaFolders),
    resourceType: z.enum(mediaResourceTypes),
  })
  .strict();

const mediaGovernanceSchema = z
  .object({
    publicId: z
      .string()
      .regex(
        /^amanor\/(?:portraits|atlas|archive|speaking|scholars|press)\/[a-zA-Z0-9/_-]+$/,
      ),
    resourceType: z.enum(mediaResourceTypes),
    altText: localizedTextSchema,
    credit: z.string().trim().min(1).max(500),
    sourceRef: z.string().trim().min(1).max(256),
    consentReference: z.string().trim().min(1).max(256).optional(),
    licence: z.string().trim().min(1).max(256),
    transformationPolicy: z.enum(mediaTransformationPolicies),
    focalPoint: focalPointSchema.optional(),
    retentionPolicy: z.enum(mediaRetentionPolicies),
    retainUntil: z.coerce.date().optional(),
    legalHold: z.boolean(),
  })
  .strict();

export const completeUploadSchema = mediaGovernanceSchema.superRefine(
  (value, context) => {
    if (value.focalPoint && value.resourceType !== "image")
      context.addIssue({
        code: "custom",
        path: ["focalPoint"],
        message: "Only images may define a focal point",
      });
    if (value.retentionPolicy === "expires" && !value.retainUntil)
      context.addIssue({
        code: "custom",
        path: ["retainUntil"],
        message: "Expiring retention requires a date",
      });
  },
);

export type CompleteUpload = z.infer<typeof completeUploadSchema>;

export const mediaMetadataUpdateSchema = mediaGovernanceSchema
  .omit({ publicId: true, resourceType: true })
  .strict()
  .superRefine((value, context) => {
    if (value.retentionPolicy === "expires" && !value.retainUntil)
      context.addIssue({
        code: "custom",
        path: ["retainUntil"],
        message: "Expiring retention requires a date",
      });
  });
export type MediaMetadataUpdate = z.infer<typeof mediaMetadataUpdateSchema>;

export const mediaAssetListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
    assetId: z.string().uuid().optional(),
    folder: z.enum(mediaFolders).optional(),
    resourceType: z.enum(mediaResourceTypes).optional(),
  })
  .strict();
export type MediaAssetListQuery = z.infer<typeof mediaAssetListQuerySchema>;

export type GovernedMediaReference = Readonly<{
  assetId: string;
  resourceType: "image" | "video";
  path: string;
  folder?: "portraits" | "atlas" | "speaking" | "scholars";
}>;

export type VerifiedCloudinaryAsset = Readonly<{
  publicId: string;
  resourceType: "image" | "video" | "raw";
  secureUrl: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  version: number;
}>;

export type MediaAsset = CompleteUpload &
  VerifiedCloudinaryAsset &
  Readonly<{
    assetId: string;
    status: "active" | "deleted" | "quarantined";
    createdBy: string;
    createdAt: Date;
    updatedBy?: string;
    updatedAt?: Date;
    deletedAt?: Date;
    retention?: Readonly<{
      attempts: number;
      processingAt?: Date;
      lockToken?: string;
      retryAt?: Date;
      failedAt?: Date;
      lastError?: string;
      blockedByPublicationAt?: Date;
    }>;
  }>;

export type MediaAssetPage = Readonly<{
  items: readonly MediaAsset[];
  nextCursor?: string;
}>;

export type MediaInventoryGap =
  | "french_alt_missing"
  | "french_alt_stale"
  | "consent_reference_missing"
  | "image_focal_point_missing"
  | "expiry_date_missing"
  | "expired_active_asset";

export type MediaInventoryReport = Readonly<{
  generatedAt: Date;
  totals: Readonly<{
    assets: number;
    active: number;
    deleted: number;
    quarantined: number;
    published: number;
    actionRequired: number;
  }>;
  items: readonly (MediaAsset &
    Readonly<{
      folder: (typeof mediaFolders)[number];
      publishedReference: boolean;
      governanceStatus: "ready" | "action_required";
      gaps: readonly MediaInventoryGap[];
    }>)[];
}>;
