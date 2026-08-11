import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthNotificationWorker } from "./auth-notification.worker";

describe("AuthNotificationWorker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stays dormant until both provider credentials are configured", () => {
    const collection = vi.fn();
    const worker = new AuthNotificationWorker(
      { db: { collection } } as never,
      new ConfigService({ RESEND_API_KEY: "test-key" }),
    );
    const drain = vi.spyOn(worker, "drain");
    worker.onApplicationBootstrap();
    expect(drain).not.toHaveBeenCalled();
    expect(collection).not.toHaveBeenCalled();
  });

  it("delivers a bilingual content-free recovery notice idempotently", async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "job-id",
        notificationId: "notification-id",
        emailCanonical: "editor@example.test",
        type: "account_recovered",
        occurredAt: new Date("2026-08-10T15:00:00.000Z"),
        attempts: 1,
      })
      .mockResolvedValueOnce(null);
    const collection = vi.fn().mockReturnValue({ findOneAndUpdate, updateOne });
    const delivery = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", delivery);
    const worker = new AuthNotificationWorker(
      { db: { collection } } as never,
      new ConfigService({
        RESEND_API_KEY: "test-key",
        EMAIL_FROM: "security@example.test",
      }),
    );

    await worker.drain();

    expect(delivery).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": "notification-id",
        }),
      }),
    );
    const request = delivery.mock.calls[0]?.[1] as RequestInit;
    if (typeof request.body !== "string")
      throw new Error("Expected a serialized email request body");
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(body.to).toEqual(["editor@example.test"]);
    expect(body.text).toMatch(/single-use recovery code/u);
    expect(body.text).toMatch(/code de récupération/u);
    expect(JSON.stringify(body)).not.toMatch(/ABCD-|password|token/iu);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "job-id" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "delivered" }),
      }),
    );
  });

  it("requeues provider failure with bounded metadata-only backoff", async () => {
    const updateOne = vi.fn().mockResolvedValue(undefined);
    const findOneAndUpdate = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "job-id",
        notificationId: "notification-failed",
        emailCanonical: "editor@example.test",
        type: "recovery_codes_rotated",
        occurredAt: new Date("2026-08-10T15:00:00.000Z"),
        attempts: 2,
      })
      .mockResolvedValueOnce(null);
    const collection = vi.fn().mockReturnValue({ findOneAndUpdate, updateOne });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const worker = new AuthNotificationWorker(
      { db: { collection } } as never,
      new ConfigService({
        RESEND_API_KEY: "test-key",
        EMAIL_FROM: "security@example.test",
      }),
    );

    await worker.drain();

    const update = updateOne.mock.calls[0]?.[1] as {
      $set: { status: string; availableAt: Date; lastError: string };
    };
    expect(update.$set.status).toBe("failed");
    expect(update.$set.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(update.$set.lastError).toBe("Email provider returned HTTP 503");
    expect(JSON.stringify(update)).not.toContain("editor@example.test");
  });
});
