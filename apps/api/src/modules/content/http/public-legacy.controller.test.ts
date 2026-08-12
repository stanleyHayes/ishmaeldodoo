import { describe, expect, it, vi } from "vitest";
import { PublicLegacyController } from "./public-legacy.controller";

describe("PublicLegacyController", () => {
  it("returns consent-filtered scholars with public caching", async () => {
    const cms = {
      listPublicScholars: vi
        .fn()
        .mockResolvedValue({ scholars: [], translation: { stale: false } }),
    };
    const controller = new PublicLegacyController(cms as never);
    const response = { setHeader: vi.fn() };
    await expect(
      controller.list("en-GB", response as never),
    ).resolves.toMatchObject({ scholars: [] });
    expect(cms.listPublicScholars).toHaveBeenCalledWith("en-GB");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      expect.stringContaining("s-maxage=300"),
    );
  });

  it("rejects unsupported locales", async () => {
    const controller = new PublicLegacyController({
      listPublicScholars: vi.fn(),
    } as never);
    await expect(
      controller.list("de-DE", { setHeader: vi.fn() } as never),
    ).rejects.toThrow();
  });
});
