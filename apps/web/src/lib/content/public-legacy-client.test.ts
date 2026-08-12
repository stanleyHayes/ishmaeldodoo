import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicLegacyClient } from "./public-legacy-client";

afterEach(() => vi.unstubAllGlobals());

describe("public legacy client", () => {
  it("accepts only the governed public scholar shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          scholars: [
            {
              documentId: "scholar-1",
              name: "Ama",
              country: "GH",
              institution: "University",
              field: "Economics",
              cohortYear: 2024,
              status: "Active",
              story: "A consent-cleared story.",
              publishedAt: "2026-08-12T00:00:00.000Z",
            },
          ],
          translation: { stale: false },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createPublicLegacyClient({
      baseUrl: "https://api.example.test/v1",
    })("en-GB");
    expect(result).toMatchObject({
      status: "available",
      scholars: [{ name: "Ama" }],
    });
    expect(new URL(fetchMock.mock.calls[0]![0] as URL).pathname).toBe(
      "/v1/public/legacy",
    );
  });

  it("fails closed when consent metadata leaks into the public response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            scholars: [
              {
                documentId: "scholar-1",
                name: "Ama",
                country: "GH",
                institution: "University",
                field: "Economics",
                cohortYear: 2024,
                status: "Active",
                story: "A consent-cleared story.",
                publishedAt: "2026-08-12T00:00:00.000Z",
                consentStatus: "granted",
                profileImageUrl: "https://untrusted.example/profile.jpg",
              },
            ],
            translation: { stale: false },
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      createPublicLegacyClient({ baseUrl: "https://api.example.test/v1" })(
        "en-GB",
      ),
    ).resolves.toEqual({ status: "unavailable" });
  });
});
