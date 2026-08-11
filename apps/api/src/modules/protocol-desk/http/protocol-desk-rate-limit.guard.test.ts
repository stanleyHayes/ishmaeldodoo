import {
  HttpException,
  ServiceUnavailableException,
  type ExecutionContext,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { RateLimitService } from "../../auth/application/rate-limit.service";
import { ProtocolDeskRateLimitGuard } from "./protocol-desk-rate-limit.guard";

function context(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip: "203.0.113.10", socket: {} }),
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("ProtocolDeskRateLimitGuard", () => {
  it("allows a request and exposes the remaining budget", async () => {
    const headers: Record<string, string> = {};
    const consume = vi
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
    const guard = new ProtocolDeskRateLimitGuard({
      consume,
    } as unknown as RateLimitService);
    await expect(guard.canActivate(context(headers))).resolves.toBe(true);
    expect(headers["X-RateLimit-Remaining"]).toBe("5");
  });

  it("returns a bounded 429 response when the distributed budget is exhausted", async () => {
    const headers: Record<string, string> = {};
    const consume = vi.fn().mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });
    const guard = new ProtocolDeskRateLimitGuard({
      consume,
    } as unknown as RateLimitService);
    await expect(guard.canActivate(context(headers))).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(headers["Retry-After"]).toBe("42");
  });

  it("fails closed when rate-limit persistence is unavailable", async () => {
    const guard = new ProtocolDeskRateLimitGuard({
      consume: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as RateLimitService);
    await expect(guard.canActivate(context({}))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
