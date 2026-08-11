import { describe, expect, it, vi } from "vitest";
import { RevalidationClaimRepository } from "./revalidation-claim.repository";

describe("RevalidationClaimRepository", () => {
  it("atomically accepts one claim and maps duplicate-key conflicts to replay", async () => {
    const insertOne = vi
      .fn()
      .mockResolvedValueOnce({ acknowledged: true })
      .mockRejectedValueOnce({ code: 11000 });
    const repository = new RevalidationClaimRepository({
      db: { collection: () => ({ insertOne }) },
    } as never);
    const now = new Date("2026-08-10T02:00:00.000Z");
    await expect(repository.claim("publish:page:home:1", now)).resolves.toBe(
      true,
    );
    await expect(repository.claim("publish:page:home:1", now)).resolves.toBe(
      false,
    );
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "publish:page:home:1",
        claimedAt: now,
        expiresAt: new Date(now.getTime() + 600_000),
      }),
    );
  });

  it("fails closed for storage errors or a disconnected database", async () => {
    const repository = new RevalidationClaimRepository({
      db: {
        collection: () => ({
          insertOne: vi.fn().mockRejectedValue(new Error("offline")),
        }),
      },
    } as never);
    await expect(repository.claim("claim")).rejects.toThrow("offline");
    await expect(
      new RevalidationClaimRepository({ db: undefined } as never).claim(
        "claim",
      ),
    ).rejects.toThrow(/not connected/iu);
  });
});
