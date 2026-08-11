import { describe, expect, it, vi } from "vitest";
import { createPublicSignalClient } from "./public-signal-client";

describe("public Signal client", () => {
  it("accepts the governed latest projection and caches by locale", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          documentId: "signal-1",
          slug: "signal-1",
          body: "A governed signal.",
          publishedAt: "2026-08-10T00:00:00.000Z",
          tags: ["finance"],
          confidence: "watching",
          changeMyMind: "Contrary evidence.",
          sourceRefs: ["source-1"],
          translation: { stale: false },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createPublicSignalClient({ baseUrl: "https://api.test/v1" });

    await expect(client("fr-FR")).resolves.toMatchObject({
      status: "available",
      signal: { slug: "signal-1", sourceRefs: ["source-1"] },
    });
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain(
      "/v1/public/signals/latest?locale=fr-FR",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      next: { tags: ["content:signal", "content:signal:fr-FR"] },
    });
  });

  it("fails closed for malformed or unavailable responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    const client = createPublicSignalClient({ baseUrl: "https://api.test/v1" });
    await expect(client("en-GB")).resolves.toEqual({ status: "unavailable" });
  });
});
