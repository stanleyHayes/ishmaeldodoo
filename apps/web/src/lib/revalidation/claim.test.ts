import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  publicServiceAuth: {
    keyId: "web-current",
    secret: "a-public-service-secret-with-thirty-two-bytes",
    audience: "amanor-public-api",
  },
  webEnvironment: {
    PUBLIC_API_BASE_URL: "https://api.example.test/v1",
    AMANOR_DEPLOYMENT_ENV: "production",
  },
}));

import { claimRevalidation } from "./claim";

describe("claimRevalidation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("signs a POST claim and distinguishes claimed from replayed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(claimRevalidation("publish:page:home:1")).resolves.toBe(
      "claimed",
    );
    await expect(claimRevalidation("publish:page:home:1")).resolves.toBe(
      "replayed",
    );
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain(
      "/internal/revalidation/claims/publish%3Apage%3Ahome%3A1",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.objectContaining({
          "X-Amanor-Service-Key-Id": "web-current",
        }),
      }),
    );
  });

  it("fails closed for upstream errors and transport failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockRejectedValueOnce(new Error("offline")),
    );
    await expect(claimRevalidation("claim-1")).resolves.toBe("unavailable");
    await expect(claimRevalidation("claim-2")).resolves.toBe("unavailable");
  });
});
