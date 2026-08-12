import { describe, expect, it, vi } from "vitest";
import { createPublicSignalsClient } from "./public-signals-client";

const signal = {
  documentId: "signal-1",
  slug: "signal-1",
  body: "A published signal body.",
  publishedAt: "2026-08-12T00:00:00.000Z",
  tags: ["economy"],
  confidence: "expecting",
  changeMyMind: "Contrary verified evidence.",
  sourceRefs: ["source-1"],
  reviewDue: "2026-09-12T00:00:00.000Z",
  translation: { stale: false },
};

describe("public Signals client", () => {
  it("validates and locale-projects the board", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ items: [signal], translation: { stale: false } }),
        { status: 200 },
      ),
    );
    const result = await createPublicSignalsClient({
      baseUrl: "https://api.test/v1",
    })("en-GB");
    expect(result.status).toBe("available");
    if (result.status === "available")
      expect(result.items[0]?.publishedAt).toBeInstanceOf(Date);
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/v1/public/signals",
        search: "?locale=en-GB",
      }),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("fails closed on malformed projections", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ slug: "broken" }] }), {
        status: 200,
      }),
    );
    await expect(
      createPublicSignalsClient({ baseUrl: "https://api.test/v1" })("en-GB"),
    ).resolves.toEqual({ status: "unavailable" });
  });
});
