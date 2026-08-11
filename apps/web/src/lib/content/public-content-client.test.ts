import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicContentClient } from "./public-content-client";

const projection = {
  documentType: "page",
  documentId: "home",
  locale: "en-GB",
  version: 2,
  publishedAt: "2026-08-09T00:00:00.000Z",
  payload: { title: "Home" },
  translation: { stale: false },
};

describe("public content client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests only the public projection with narrow Next.js cache tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(projection), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createPublicContentClient({
      baseUrl: "https://api.example.test/v1/",
    });
    await expect(
      client({ documentType: "page", documentId: "home", locale: "en-GB" }),
    ).resolves.toEqual(expect.objectContaining({ status: "available" }));
    const [, init] = fetchMock.mock.calls[0] as [
      URL,
      { credentials?: string; next?: { tags?: string[] } },
    ];
    expect(init.credentials).toBeUndefined();
    expect(init.next?.tags).toEqual(
      expect.arrayContaining(["content:page:home", "locale:en-GB"]),
    );
  });

  it("distinguishes absent content from upstream and contract failures", async () => {
    const client = createPublicContentClient({
      baseUrl: "https://api.example.test/v1",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ wrong: true }), { status: 200 }),
        ),
    );
    await expect(
      client({ documentType: "page", documentId: "missing", locale: "en-GB" }),
    ).resolves.toEqual({ status: "not_found" });
    await expect(
      client({ documentType: "page", documentId: "home", locale: "en-GB" }),
    ).resolves.toEqual({ status: "unavailable", reason: "upstream" });
    await expect(
      client({ documentType: "page", documentId: "home", locale: "en-GB" }),
    ).resolves.toEqual({ status: "unavailable", reason: "invalid_response" });
  });

  it("applies French typography after validating the public projection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...projection,
            locale: "fr-FR",
            payload: {
              title: "Question? «Réponse»",
              canonicalUrl: "https://example.test/fr?view=full",
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await createPublicContentClient({
      baseUrl: "https://api.example.test/v1",
    })({ documentType: "page", documentId: "home", locale: "fr-FR" });
    expect(result).toMatchObject({
      status: "available",
      content: {
        payload: {
          title: "Question\u00a0? «\u00a0Réponse\u00a0»",
          canonicalUrl: "https://example.test/fr?view=full",
        },
      },
    });
  });
});
