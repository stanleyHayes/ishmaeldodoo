import { describe, expect, it, vi } from "vitest";
import { createPublicSpeakingClient } from "./public-speaking-client";

describe("public Speaking client", () => {
  it("accepts a governed projection and applies locale cache tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              documentId: "public-value",
              slug: "public-value",
              title: "Public value",
              summary: "A practical theme",
              audiences: ["Programme directors"],
              formats: ["keynote"],
              sourceRefs: ["SRC-001"],
              relatedNodes: [],
              featured: true,
              publishedAt: "2026-08-09T00:00:00.000Z",
              history: [
                {
                  slug: "platform-one",
                  title: "Platform one",
                  host: "Host one",
                  date: "2026-06-01T00:00:00.000Z",
                  country: "GH",
                  format: "keynote",
                  sourceRefs: ["SRC-001"],
                },
                {
                  slug: "platform-two",
                  title: "Platform two",
                  host: "Host two",
                  date: "2026-07-01T00:00:00.000Z",
                  country: "GH",
                  format: "keynote",
                  sourceRefs: ["SRC-001"],
                },
              ],
            },
          ],
          translation: { stale: false },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createPublicSpeakingClient({
      baseUrl: "https://api.example.test/v1",
    })("fr-FR");
    expect(result.status).toBe("available");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: "?locale=fr-FR" }),
      expect.objectContaining({
        next: expect.objectContaining({
          tags: ["content:speakingTheme", "content:speakingTheme:fr-FR"],
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("fails closed on invalid responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{}] }))),
    );
    await expect(
      createPublicSpeakingClient({ baseUrl: "https://api.example.test/v1" })(
        "en-GB",
      ),
    ).resolves.toEqual({ status: "unavailable" });
    vi.unstubAllGlobals();
  });
});
