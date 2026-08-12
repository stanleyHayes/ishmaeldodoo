import {
  HttpException,
  ServiceUnavailableException,
  type ExecutionContext,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  ProtocolDeskDecisionRateLimitGuard,
  ProtocolDeskRateLimitGuard,
} from "./protocol-desk-rate-limit.guard";

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
    });
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
    });
    await expect(guard.canActivate(context(headers))).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(headers["Retry-After"]).toBe("42");
  });

  it("fails closed when rate-limit persistence is unavailable", async () => {
    const guard = new ProtocolDeskRateLimitGuard({
      consume: vi.fn().mockRejectedValue(new Error("offline")),
    });
    await expect(guard.canActivate(context({}))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe("ProtocolDeskDecisionRateLimitGuard", () => {
  it("meters the decision callback under its own bucket and budget", async () => {
    const headers: Record<string, string> = {};
    const consume = vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 19,
      retryAfterSeconds: 0,
    });
    const guard = new ProtocolDeskDecisionRateLimitGuard({
      consume,
    });
    await expect(guard.canActivate(context(headers))).resolves.toBe(true);
    // Its own bucket keeps the decision budget independent of intake.
    expect(consume).toHaveBeenCalledWith(
      "protocol-desk-decision",
      "203.0.113.10",
      20,
      60 * 60 * 1_000,
    );
    expect(headers["X-RateLimit-Remaining"]).toBe("19");
  });

  it("returns a bounded 429 when the decision budget is exhausted", async () => {
    const headers: Record<string, string> = {};
    const consume = vi.fn().mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });
    const guard = new ProtocolDeskDecisionRateLimitGuard({
      consume,
    });
    await expect(guard.canActivate(context(headers))).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(headers["Retry-After"]).toBe("30");
  });
});
