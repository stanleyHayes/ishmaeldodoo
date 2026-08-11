import { createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Connection } from "mongoose";
import { RateLimitService } from "./rate-limit.service";

describe("RateLimitService", () => {
  it("fails closed when the database is unavailable", async () => {
    const service = new RateLimitService({} as Connection, new ConfigService());

    await expect(service.consume("auth", "person", 2, 60_000)).rejects.toThrow(
      "Rate limiter database is unavailable",
    );
  });

  it("stores a peppered key and returns the remaining window allowance", async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue({ count: 2 });
    const collection = vi.fn().mockReturnValue({ findOneAndUpdate });
    const service = new RateLimitService(
      { db: { collection } } as unknown as Connection,
      new ConfigService({ RATE_LIMIT_PEPPER: "test-rate-limit-pepper" }),
    );
    const now = new Date("2026-08-11T12:00:30.000Z");

    await expect(
      service.consume("auth", "person@example.com", 3, 60_000, now),
    ).resolves.toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 30,
    });
    expect(collection).toHaveBeenCalledWith("rate_limits");
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        key: createHmac("sha256", "test-rate-limit-pepper")
          .update("auth:person@example.com")
          .digest("hex"),
        windowStart: new Date("2026-08-11T12:00:00.000Z"),
      },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date("2026-08-11T12:02:00.000Z") },
      },
      { upsert: true, returnDocument: "after" },
    );
  });

  it("blocks exhausted windows and applies safe defaults", async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue({ count: 4 });
    const service = new RateLimitService(
      {
        db: { collection: vi.fn().mockReturnValue({ findOneAndUpdate }) },
      } as unknown as Connection,
      new ConfigService({ SESSION_PEPPER: "session-pepper" }),
    );

    await expect(
      service.consume("auth", "person", 3, 60_000, new Date(60_000)),
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
  });
});
