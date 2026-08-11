import {
  HttpException,
  ServiceUnavailableException,
  type ExecutionContext,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { RateLimitService } from "../../auth/application/rate-limit.service";
import { RoomRateLimitGuard } from "./room-rate-limit.guard";

function context(ip = "203.0.113.7") {
  const setHeader = vi.fn();
  return {
    execution: {
      switchToHttp: () => ({
        getRequest: () => ({ ip, socket: {} }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext,
    setHeader,
  };
}

describe("RoomRateLimitGuard", () => {
  it("allows requests within the confidential-room quota", async () => {
    const consume = vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 2,
      retryAfterSeconds: 60,
    });
    const guard = new RoomRateLimitGuard({
      consume,
    } as unknown as RateLimitService);
    const request = context();

    await expect(guard.canActivate(request.execution)).resolves.toBe(true);
    expect(consume).toHaveBeenCalledWith(
      "room-submission-ip",
      "203.0.113.7",
      3,
      3_600_000,
    );
  });

  it("returns retry guidance when the quota is exhausted", async () => {
    const guard = new RoomRateLimitGuard({
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 42,
      }),
    } as unknown as RateLimitService);
    const request = context();

    await expect(guard.canActivate(request.execution)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(request.setHeader).toHaveBeenCalledWith("Retry-After", "42");
  });

  it("fails closed when the limiter is unavailable", async () => {
    const guard = new RoomRateLimitGuard({
      consume: vi.fn().mockRejectedValue(new Error("database unavailable")),
    } as unknown as RateLimitService);

    await expect(
      guard.canActivate(context("").execution),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
