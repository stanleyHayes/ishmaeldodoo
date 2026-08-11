import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PressKitRateLimitGuard } from "./press-kit-rate-limit.guard";

function context(path: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        path,
        ip: "203.0.113.7",
        socket: {},
      }),
      getResponse: () => ({ setHeader: vi.fn() }),
    }),
  } as ExecutionContext;
}

describe("PressKitRateLimitGuard", () => {
  it("isolates costly public workflows so one cannot exhaust another", async () => {
    const consume = vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
    });
    const guard = new PressKitRateLimitGuard({ consume } as never);
    await guard.canActivate(context("/v1/public/press-kit"));
    await guard.canActivate(context("/v1/public/media-enquiries"));
    await guard.canActivate(context("/v1/public/living-dossier"));
    expect(consume).toHaveBeenNthCalledWith(
      1,
      "press-kit-ip",
      "203.0.113.7",
      10,
      3_600_000,
    );
    expect(consume).toHaveBeenNthCalledWith(
      2,
      "media-enquiry-ip",
      "203.0.113.7",
      5,
      3_600_000,
    );
    expect(consume).toHaveBeenNthCalledWith(
      3,
      "living-dossier-ip",
      "203.0.113.7",
      5,
      3_600_000,
    );
  });

  it("returns retryable denial and fails closed when storage is unavailable", async () => {
    const denied = new PressKitRateLimitGuard({
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 60,
      }),
    } as never);
    await expect(
      denied.canActivate(context("/v1/public/media-enquiries")),
    ).rejects.toMatchObject({ status: 429 });
    const unavailable = new PressKitRateLimitGuard({
      consume: vi.fn().mockRejectedValue(new Error("database unavailable")),
    } as never);
    await expect(
      unavailable.canActivate(context("/v1/public/press-kit")),
    ).rejects.toMatchObject({ status: 503 });
  });
});
