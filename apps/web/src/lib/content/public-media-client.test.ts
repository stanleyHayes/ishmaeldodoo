import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicMediaClient } from "./public-media-client";

const asset = {
  assetId: "123e4567-e89b-12d3-a456-426614174000",
  secureUrl: "https://res.cloudinary.com/demo/image/upload/portrait.jpg",
  resourceType: "image",
  format: "jpg",
  width: 1200,
  height: 1500,
  bytes: 1000,
  version: 1,
  altText: "Approved portrait",
  credit: "Photographer",
  licence: "Editorial use",
  sourceRef: "source-1",
};

describe("public media client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads locale-projected governed media with cache tags", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(asset), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createPublicMediaClient({
      baseUrl: "https://api.example.test/v1",
    });
    await expect(client(asset.assetId, "fr-FR")).resolves.toEqual({
      status: "available",
      asset,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://api.example.test/v1/public/media/${asset.assetId}?locale=fr-FR`,
    );
  });

  it("distinguishes missing assets from upstream failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createPublicMediaClient({
      baseUrl: "https://api.example.test/v1",
    });
    await expect(client(asset.assetId, "en-GB")).resolves.toEqual({
      status: "not_found",
    });
    await expect(client(asset.assetId, "en-GB")).resolves.toEqual({
      status: "unavailable",
    });
  });
});
