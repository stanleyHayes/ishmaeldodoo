import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { MediaEnquiryWorker } from "./media-enquiry.worker";

describe("MediaEnquiryWorker degradation", () => {
  it("does not claim jobs when delivery configuration is incomplete", () => {
    const collection = vi.fn();
    const worker = new MediaEnquiryWorker(
      { db: { collection } } as never,
      new ConfigService({ RESEND_API_KEY: "resend-test-key" }),
    );
    const drain = vi.spyOn(worker, "drain");

    worker.onApplicationBootstrap();

    expect(drain).not.toHaveBeenCalled();
    expect(collection).not.toHaveBeenCalled();
  });

  it("reclaims stale jobs and durably requeues a provider failure", async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "job-id",
        reference: "ME-2026-FAILED1",
        name: "Journalist",
        outlet: "Example News",
        email: "journalist@example.test",
        subject: "Interview",
        message: "Embargoed details must not enter the retry error.",
        attempts: 2,
      })
      .mockResolvedValueOnce(null);
    const collection = vi.fn().mockReturnValue({ findOneAndUpdate, updateOne });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 429 })),
    );
    const worker = new MediaEnquiryWorker(
      { db: { collection } } as never,
      new ConfigService({
        RESEND_API_KEY: "resend-test-key",
        EMAIL_FROM: "press@example.test",
        PRESS_CONTACT_EMAIL: "office@example.test",
      }),
    );

    await worker.drain();

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ status: "processing" }),
        ]),
      }),
      expect.anything(),
      expect.anything(),
    );
    const failure = updateOne.mock.calls[0]?.[1] as {
      $set: { status: string; lastError: string };
    };
    expect(failure.$set).toEqual(
      expect.objectContaining({
        status: "failed",
        lastError: "Resend returned HTTP 429",
      }),
    );
    expect(JSON.stringify(failure)).not.toContain("Embargoed details");
    vi.unstubAllGlobals();
  });
});
