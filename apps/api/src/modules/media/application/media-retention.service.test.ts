import { describe, expect, it, vi } from "vitest";
import type { MediaAsset } from "../domain/media";
import { MediaRetentionService } from "./media-retention.service";

const now = new Date("2026-08-10T12:00:00.000Z");
const candidate = {
  assetId: "asset-expired",
  publicId: "amanor/archive/expired",
  resourceType: "image",
  status: "active",
  retentionPolicy: "expires",
  retainUntil: new Date("2026-08-09T12:00:00.000Z"),
} as MediaAsset;

function harness(options?: { referenced?: boolean; destroyFails?: boolean }) {
  const repository = {
    nextRetentionCandidate: vi
      .fn()
      .mockResolvedValueOnce(candidate)
      .mockResolvedValueOnce(null),
    claimRetentionIfUnreferenced: vi
      .fn()
      .mockResolvedValue(options?.referenced ? "referenced" : candidate),
    completeRetention: vi.fn().mockResolvedValue(true),
    failRetention: vi.fn().mockResolvedValue(undefined),
  };
  const cloudinary = {
    destroy: options?.destroyFails
      ? vi.fn().mockRejectedValue(new Error("provider unavailable"))
      : vi.fn().mockResolvedValue(undefined),
  };
  const service = new MediaRetentionService(
    repository as never,
    cloudinary as never,
  );
  return { service, repository, cloudinary };
}

describe("MediaRetentionService", () => {
  it("quarantines and destroys an unreferenced expired asset", async () => {
    const { service, repository, cloudinary } = harness();

    await expect(service.run(now)).resolves.toEqual({
      deleted: 1,
      failed: 0,
      referenced: 0,
    });
    expect(repository.claimRetentionIfUnreferenced).toHaveBeenCalledWith(
      candidate.assetId,
      now,
      new Date("2026-08-10T11:00:00.000Z"),
      expect.stringMatching(/^[0-9a-f-]{36}$/u),
      new Date("2026-08-11T12:00:00.000Z"),
    );
    expect(cloudinary.destroy).toHaveBeenCalledWith(
      candidate.publicId,
      candidate.resourceType,
    );
    expect(repository.completeRetention).toHaveBeenCalledOnce();
  });

  it("defers published assets without calling the provider", async () => {
    const { service, repository, cloudinary } = harness({ referenced: true });

    await expect(service.run(now)).resolves.toEqual({
      deleted: 0,
      failed: 0,
      referenced: 1,
    });
    expect(repository.claimRetentionIfUnreferenced).toHaveBeenCalledWith(
      candidate.assetId,
      now,
      new Date("2026-08-10T11:00:00.000Z"),
      expect.stringMatching(/^[0-9a-f-]{36}$/u),
      new Date("2026-08-11T12:00:00.000Z"),
    );
    expect(cloudinary.destroy).not.toHaveBeenCalled();
  });

  it("keeps a provider failure quarantined and schedules a bounded retry", async () => {
    const { service, repository } = harness({ destroyFails: true });

    await expect(service.run(now)).resolves.toEqual({
      deleted: 0,
      failed: 1,
      referenced: 0,
    });
    expect(repository.failRetention).toHaveBeenCalledWith(
      candidate.assetId,
      expect.stringMatching(/^[0-9a-f-]{36}$/u),
      now,
      new Date("2026-08-10T13:00:00.000Z"),
      "provider unavailable",
    );
  });

  it("does nothing when there is no due work", async () => {
    const { service, repository, cloudinary } = harness();
    repository.nextRetentionCandidate.mockReset().mockResolvedValue(null);

    await expect(service.run(now)).resolves.toEqual({
      deleted: 0,
      failed: 0,
      referenced: 0,
    });
    expect(cloudinary.destroy).not.toHaveBeenCalled();
  });
});
