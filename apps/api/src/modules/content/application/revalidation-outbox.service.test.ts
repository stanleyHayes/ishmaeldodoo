import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { RevalidationOutboxService } from "./revalidation-outbox.service";

const job = {
  _id: "job-id",
  idempotencyKey: "publish:page:home:en-GB:1",
  tags: ["content:page:home", "locale:en-GB"],
  attempts: 2,
};

describe("RevalidationOutboxService degradation", () => {
  it("durably requeues a claimed job when signing configuration is invalid", async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(null);
    const collection = vi.fn().mockReturnValue({ findOneAndUpdate, updateOne });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const worker = new RevalidationOutboxService(
      { db: { collection } } as never,
      new ConfigService({
        WEB_REVALIDATION_URL: "https://www.example.test/api/revalidate",
        REVALIDATION_ACTIVE_KEY_ID: "missing",
        REVALIDATION_WEBHOOK_KEYS: JSON.stringify({ current: "secret" }),
      }),
    );

    await worker.drain();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "job-id", status: "processing" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "failed",
          lastError: "Active revalidation key is unavailable",
          availableAt: expect.any(Date),
        }),
        $unset: { lockedAt: "" },
      }),
    );
    vi.unstubAllGlobals();
  });

  it("treats an endpoint replay as success and clears prior failure state", async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce({ ...job, attempts: 3 })
      .mockResolvedValueOnce(null);
    const collection = vi.fn().mockReturnValue({ findOneAndUpdate, updateOne });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const worker = new RevalidationOutboxService(
      { db: { collection } } as never,
      new ConfigService({
        WEB_REVALIDATION_URL: "https://www.example.test/api/revalidate",
        REVALIDATION_ACTIVE_KEY_ID: "current",
        REVALIDATION_AUDIENCE: "amanor-public-web",
        REVALIDATION_WEBHOOK_KEYS: JSON.stringify({
          current: "a-revalidation-secret-that-is-long-enough",
        }),
      }),
    );

    await worker.drain();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.example.test/api/revalidate",
      expect.objectContaining({ redirect: "error" }),
    );
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "job-id", status: "processing" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "completed" }),
        $unset: { lockedAt: "", lastError: "" },
      }),
    );
    vi.unstubAllGlobals();
  });
});
