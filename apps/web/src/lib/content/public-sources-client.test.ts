import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicSourcesClient } from "./public-sources-client";

describe("public Source Register client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests a bounded cached page and parses dates", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              ref: "source-1",
              title: "Official record",
              publisher: "Institution",
              accessedAt: "2026-08-09T00:00:00Z",
              type: "official",
            },
          ],
          nextCursor: "source-1",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createPublicSourcesClient({
      baseUrl: "https://api.example.test/v1",
    });
    await expect(
      client({ locale: "fr-FR", query: "official" }),
    ).resolves.toEqual({
      status: "available",
      page: {
        items: [expect.objectContaining({ accessedAt: expect.any(Date) })],
        nextCursor: "source-1",
      },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.example.test/v1/public/sources?locale=fr-FR&limit=25&q=official",
    );
  });

  it("fails closed for invalid or unavailable responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    const client = createPublicSourcesClient({
      baseUrl: "https://api.example.test/v1",
    });
    await expect(client({ locale: "en-GB" })).resolves.toEqual({
      status: "unavailable",
    });
  });
});
