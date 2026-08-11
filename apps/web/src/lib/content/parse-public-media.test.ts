import { describe, expect, it } from "vitest";
import { parsePublicMedia } from "./parse-public-media";

const valid = {
  assetId: "9f9dc2f1-1f08-4df7-9672-099e79123609",
  secureUrl: "https://res.cloudinary.com/example/image/upload/example.jpg",
  resourceType: "image",
  format: "jpg",
  width: 1200,
  height: 800,
  bytes: 42_000,
  version: 1,
  altText: "A governed image",
  credit: "Project AMANOR",
  licence: "Approved use",
  sourceRef: "SRC-001",
  focalPoint: { x: 0.4, y: 0.6 },
};

describe("parsePublicMedia", () => {
  it("accepts the complete bounded public projection", () => {
    expect(parsePublicMedia({ ...valid, internal: "must not escape" })).toEqual(
      valid,
    );
  });

  it.each([
    null,
    { ...valid, assetId: "not-a-uuid" },
    { ...valid, secureUrl: "javascript:alert(1)" },
    { ...valid, resourceType: "script" },
    { ...valid, bytes: -1 },
    { ...valid, focalPoint: { x: 2, y: 0.5 } },
    { ...valid, focalPoint: { x: Number.NaN, y: 0.5 } },
    { ...valid, duration: Number.NaN },
    { ...valid, sourceRef: "" },
  ])("rejects malformed or unsafe media projections", (value) => {
    expect(parsePublicMedia(value)).toBeUndefined();
  });
});
