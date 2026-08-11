import { describe, expect, it, vi } from "vitest";
import type { MediaRepository } from "../persistence/media.repository";
import { MediaReferenceService } from "./media-reference.service";

const reference = {
  assetId: "00000000-0000-4000-8000-000000000001",
  resourceType: "image" as const,
  folder: "speaking" as const,
  path: "media.0.assetId",
};

function fixture(asset: Record<string, unknown> | null) {
  const repository = {
    findMany: vi.fn().mockResolvedValue(asset ? [asset] : []),
  };
  return {
    service: new MediaReferenceService(
      repository as unknown as MediaRepository,
    ),
    repository,
  };
}

describe("MediaReferenceService", () => {
  it("accepts an active field-compatible governed asset", async () => {
    const { service, repository } = fixture({
      ...reference,
      status: "active",
      publicId: "amanor/speaking/keynote",
    });
    await expect(
      service.assertPublishable([reference]),
    ).resolves.toBeUndefined();
    expect(repository.findMany).toHaveBeenCalledWith([reference.assetId]);
  });

  it.each([
    [null, /not active/iu],
    [
      { ...reference, status: "deleted", publicId: "amanor/speaking/old" },
      /not active/iu,
    ],
    [
      {
        ...reference,
        status: "active",
        resourceType: "video",
        publicId: "amanor/speaking/video",
      },
      /must be image/iu,
    ],
    [
      {
        ...reference,
        status: "active",
        publicId: "amanor/archive/still",
      },
      /speaking folder/iu,
    ],
  ])(
    "rejects missing, inactive, wrong-type or wrong-folder media",
    async (asset, message) => {
      const { service } = fixture(asset);
      await expect(service.assertPublishable([reference])).rejects.toThrow(
        message,
      );
    },
  );
});
