import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { ContactEnquiryWorker } from "./contact-enquiry.worker";

describe("ContactEnquiryWorker", () => {
  it("does not claim jobs when delivery configuration is incomplete", () => {
    const collection = vi.fn();
    const worker = new ContactEnquiryWorker(
      { db: { collection } } as never,
      new ConfigService({
        RESEND_API_KEY: "resend-test-key",
        GENERAL_CONTACT_EMAIL: "office@example.test",
      }),
    );
    const drain = vi.spyOn(worker, "drain");

    worker.onApplicationBootstrap();

    expect(drain).not.toHaveBeenCalled();
    expect(collection).not.toHaveBeenCalled();
  });

  it("delivers with an idempotency key and marks the job delivered", async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "job-id",
        reference: "GC-2026-ABC12345",
        name: "Ama Mensah",
        email: "ama@example.test",
        category: "general",
        subject: "Public record question",
        message: "A sufficiently detailed general contact message.",
        locale: "en-GB",
        attempts: 1,
      })
      .mockResolvedValueOnce(null);
    const collection = vi.fn().mockReturnValue({ findOneAndUpdate, updateOne });
    const delivery = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", delivery);
    const worker = new ContactEnquiryWorker(
      { db: { collection } } as never,
      new ConfigService({
        RESEND_API_KEY: "resend-test-key",
        EMAIL_FROM: "contact@example.test",
        GENERAL_CONTACT_EMAIL: "office@example.test",
      }),
    );

    await worker.drain();

    expect(delivery).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        redirect: "error",
        headers: expect.objectContaining({
          "Idempotency-Key": "GC-2026-ABC12345",
        }),
      }),
    );
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "job-id" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "delivered" }),
      }),
    );
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ status: "processing" }),
        ]),
      }),
      expect.anything(),
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });

  it("requeues provider failures with bounded backoff and no message data in the error", async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "job-id",
        reference: "GC-2026-FAILED1",
        name: "Ama Mensah",
        email: "ama@example.test",
        category: "general",
        subject: "Private subject",
        message: "Sensitive message must never enter the retry error.",
        locale: "en-GB",
        attempts: 2,
      })
      .mockResolvedValueOnce(null);
    const collection = vi.fn().mockReturnValue({ findOneAndUpdate, updateOne });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const worker = new ContactEnquiryWorker(
      { db: { collection } } as never,
      new ConfigService({
        RESEND_API_KEY: "resend-test-key",
        EMAIL_FROM: "contact@example.test",
        GENERAL_CONTACT_EMAIL: "office@example.test",
      }),
    );

    await worker.drain();

    const failure = updateOne.mock.calls[0]?.[1] as {
      $set: { status: string; availableAt: Date; lastError: string };
    };
    expect(failure.$set.status).toBe("failed");
    expect(failure.$set.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(failure.$set.lastError).toBe("Resend returned HTTP 503");
    expect(JSON.stringify(failure)).not.toContain("Sensitive message");
    vi.unstubAllGlobals();
  });
});
