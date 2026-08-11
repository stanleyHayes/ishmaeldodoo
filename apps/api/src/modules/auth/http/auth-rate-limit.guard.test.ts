import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { RateLimitService } from "../application/rate-limit.service";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";

function context(path: string, body: unknown = {}) {
  const headers = new Map<string, string>();
  const request = { path, body, ip: "203.0.113.9", socket: {} };
  const response = {
    setHeader: (key: string, value: string) => headers.set(key, value),
  };
  return {
    headers,
    executionContext: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext,
  };
}

describe("AuthRateLimitGuard", () => {
  it("applies both IP and canonical principal limits to login", async () => {
    const limiter = {
      consume: vi.fn().mockResolvedValue({
        allowed: true,
        remaining: 4,
        retryAfterSeconds: 900,
      }),
    };
    const guard = new AuthRateLimitGuard(
      limiter as unknown as RateLimitService,
    );
    const request = context("/v1/auth/login", {
      email: " Editor@Example.Test ",
    });
    await expect(guard.canActivate(request.executionContext)).resolves.toBe(
      true,
    );
    expect(limiter.consume).toHaveBeenNthCalledWith(
      1,
      "auth-login-ip",
      "203.0.113.9",
      30,
      900_000,
    );
    expect(limiter.consume).toHaveBeenNthCalledWith(
      2,
      "auth-login-principal",
      "203.0.113.9:editor@example.test",
      5,
      900_000,
    );
    expect(request.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  it("returns retry guidance on exhaustion and fails closed when protection is unavailable", async () => {
    const blocked = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 37,
      }),
    };
    const blockedRequest = context("/v1/auth/refresh");
    await expect(
      new AuthRateLimitGuard(
        blocked as unknown as RateLimitService,
      ).canActivate(blockedRequest.executionContext),
    ).rejects.toMatchObject({ status: 429 });
    expect(blockedRequest.headers.get("Retry-After")).toBe("37");

    const failed = {
      consume: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };
    await expect(
      new AuthRateLimitGuard(failed as unknown as RateLimitService).canActivate(
        context("/v1/auth/refresh").executionContext,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
