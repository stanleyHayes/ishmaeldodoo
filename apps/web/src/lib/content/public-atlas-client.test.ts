import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicAtlasClient } from "./public-atlas-client";
describe("public Atlas client", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("parses only bounded published projections and applies locale cache tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              slug: "accra",
              label: "Accra",
              institution: "Institution",
              role: "Role",
              country: "Ghana",
              coordinates: [-0.2, 5.6],
              startDate: "2025-01-01",
              endDate: null,
              era: "Current",
              themes: ["financing"],
              outcomes: ["Outcome"],
              sourceRefs: ["source-1"],
            },
          ],
          translation: { stale: false },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createPublicAtlasClient({
      baseUrl: "https://api.example.test/v1",
    })("fr-FR");
    expect(result.status).toBe("available");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.example.test/v1/public/atlas?locale=fr-FR",
    );
  });
  it("fails closed for malformed or unavailable results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: new Array(61).fill({}) }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createPublicAtlasClient({
      baseUrl: "https://api.example.test/v1",
    });
    await expect(client("en-GB")).resolves.toEqual({ status: "unavailable" });
    await expect(client("en-GB")).resolves.toEqual({ status: "unavailable" });
  });
});
