import { describe, expect, it } from "vitest";
import {
  completeUploadSchema,
  mediaAssetListQuerySchema,
  mediaMetadataUpdateSchema,
} from "./media";

const governance = {
  publicId: "amanor/portraits/portrait-1",
  resourceType: "image" as const,
  altText: {
    "en-GB": "Portrait",
    "fr-FR": "Portrait FR",
    status: { "en-GB": "current" as const, "fr-FR": "current" as const },
    sourceUpdatedAt: new Date(),
  },
  credit: "Photographer",
  sourceRef: "S01",
  licence: "Editorial use",
  transformationPolicy: "portrait" as const,
  retentionPolicy: "standard" as const,
  legalHold: false,
};

describe("media governance schemas", () => {
  it("accepts governed image crop metadata", () => {
    expect(
      completeUploadSchema.safeParse({
        ...governance,
        focalPoint: { x: 0.25, y: 0.75 },
      }).success,
    ).toBe(true);
  });

  it("rejects focal points for non-images and expiring retention without a date", () => {
    expect(
      completeUploadSchema.safeParse({
        ...governance,
        resourceType: "video",
        focalPoint: { x: 0.5, y: 0.5 },
      }).success,
    ).toBe(false);
    const metadata = {
      altText: governance.altText,
      credit: governance.credit,
      sourceRef: governance.sourceRef,
      licence: governance.licence,
      transformationPolicy: governance.transformationPolicy,
      retentionPolicy: governance.retentionPolicy,
      legalHold: governance.legalHold,
    };
    expect(
      mediaMetadataUpdateSchema.safeParse({
        ...metadata,
        retentionPolicy: "expires",
      }).success,
    ).toBe(false);
    expect(
      mediaMetadataUpdateSchema.safeParse({
        ...metadata,
        retentionPolicy: "expires",
        retainUntil: new Date("2027-01-01T00:00:00.000Z"),
      }).success,
    ).toBe(true);
  });

  it("accepts exact governed asset lookups and rejects malformed identifiers", () => {
    expect(
      mediaAssetListQuerySchema.safeParse({
        assetId: "00000000-0000-4000-8000-000000000001",
        resourceType: "image",
      }).success,
    ).toBe(true);
    expect(
      mediaAssetListQuerySchema.safeParse({ assetId: "pasted-cloudinary-id" })
        .success,
    ).toBe(false);
  });
});
