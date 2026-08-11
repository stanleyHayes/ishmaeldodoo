import { describe, expect, it } from "vitest";
import { collectGovernedMediaReferences } from "./publication-validation";

describe("governed media reference collection", () => {
  it("maps every image-bearing page field to an image reference path", () => {
    expect(
      collectGovernedMediaReferences("page", {
        ogImage: "og",
        sections: [
          {
            fieldImage: "field",
            marginalia: [{ image: "marginalia" }, { value: "text only" }],
          },
        ],
      }),
    ).toEqual([
      { assetId: "og", resourceType: "image", path: "ogImage" },
      {
        assetId: "field",
        resourceType: "image",
        path: "sections.0.fieldImage",
      },
      {
        assetId: "marginalia",
        resourceType: "image",
        path: "sections.0.marginalia.0.image",
      },
    ]);
  });

  it("maps identity, Atlas, Scholar and Speaking fields with type and folder", () => {
    expect(
      collectGovernedMediaReferences("identity", {
        portraits: ["portrait"],
        pronunciationAudio: "audio",
      }),
    ).toEqual([
      {
        assetId: "portrait",
        resourceType: "image",
        path: "portraits.0",
        folder: "portraits",
      },
      {
        assetId: "audio",
        resourceType: "video",
        path: "pronunciationAudio",
      },
    ]);
    expect(
      collectGovernedMediaReferences("atlasNode", { image: "atlas" }),
    ).toEqual([
      {
        assetId: "atlas",
        resourceType: "image",
        path: "image",
        folder: "atlas",
      },
    ]);
    expect(
      collectGovernedMediaReferences("scholar", { photo: "scholar" }),
    ).toEqual([
      {
        assetId: "scholar",
        resourceType: "image",
        path: "photo",
        folder: "scholars",
      },
    ]);
    expect(
      collectGovernedMediaReferences("speakingTheme", {
        media: [
          { assetId: "still", kind: "image" },
          { assetId: "recording", kind: "video" },
        ],
      }),
    ).toEqual([
      {
        assetId: "still",
        resourceType: "image",
        path: "media.0.assetId",
        folder: "speaking",
      },
      {
        assetId: "recording",
        resourceType: "video",
        path: "media.1.assetId",
        folder: "speaking",
      },
    ]);
  });
});
