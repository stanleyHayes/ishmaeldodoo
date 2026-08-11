import { describe, expect, it, vi } from "vitest";
import type { Connection } from "mongoose";
import { MediaRepository } from "./media.repository";

describe("MediaRepository list", () => {
  it("combines an exact selected asset lookup with active type and folder filters", async () => {
    const toArray = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockReturnValue({ toArray });
    const sort = vi.fn().mockReturnValue({ limit });
    const find = vi.fn().mockReturnValue({ sort });
    const connection = {
      db: { collection: vi.fn().mockReturnValue({ find }) },
    } as unknown as Connection;
    const repository = new MediaRepository(connection);
    const assetId = "00000000-0000-4000-8000-000000000001";

    await expect(
      repository.list({
        limit: 25,
        assetId,
        folder: "speaking",
        resourceType: "video",
      }),
    ).resolves.toEqual({ items: [] });

    expect(find).toHaveBeenCalledWith(
      {
        status: "active",
        assetId,
        publicId: { $regex: "^amanor/speaking/" },
        resourceType: "video",
      },
      { projection: { _id: 0 } },
    );
  });
});
