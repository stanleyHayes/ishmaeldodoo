import { describe, expect, it, vi } from "vitest";
import { createPublicArchiveClient } from "./public-archive-client";

describe("public Archive client", () => {
  it("accepts only the bounded published projection and sets locale cache tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              documentId: "speech-1",
              slug: "public-speech",
              title: "Public speech",
              type: "speech",
              date: "2026-08-08T00:00:00.000Z",
              publishedAt: "2026-08-09T00:00:00.000Z",
              language: "en",
              transcriptStatus: "corrected",
            },
          ],
          translation: { stale: false },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createPublicArchiveClient({
      baseUrl: "https://api.example.test/v1",
    })("fr-FR", { query: "public value", type: "speech" });
    expect(result.status).toBe("available");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "?locale=fr-FR&q=public+value&type=speech",
      }),
      expect.objectContaining({
        next: expect.objectContaining({
          tags: ["content:archiveItem", "content:archiveItem:fr-FR"],
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("fails closed on invalid or unavailable responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{}] }))),
    );
    await expect(
      createPublicArchiveClient({ baseUrl: "https://api.example.test/v1" })(
        "en-GB",
      ),
    ).resolves.toEqual({ status: "unavailable" });
    vi.unstubAllGlobals();
  });
});
