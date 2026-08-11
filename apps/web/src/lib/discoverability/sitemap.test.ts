import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicContent = vi.fn();

vi.mock("../content/get-public-content", () => ({
  getPublicContent: (...args: unknown[]) => getPublicContent(...args),
}));

vi.mock("../env", () => ({
  webEnvironment: { PUBLIC_WEB_BASE_URL: "https://amanor.example" },
}));

const { localeSitemap } = await import("./sitemap");

const available = (payload: Record<string, unknown> = {}) => ({
  status: "available" as const,
  content: {
    payload,
    publishedAt: new Date("2026-08-09T00:00:00.000Z"),
  },
});

beforeEach(() => {
  getPublicContent.mockReset();
});

describe("locale sitemap", () => {
  it("carries The Room alongside its parent contact page", async () => {
    getPublicContent.mockResolvedValue(available());

    const xml = await localeSitemap("en-GB");

    expect(xml).toContain("<loc>https://amanor.example/contact</loc>");
    expect(xml).toContain("<loc>https://amanor.example/contact/room</loc>");
  });

  it("emits the French reciprocal Room route", async () => {
    getPublicContent.mockResolvedValue(available());

    const xml = await localeSitemap("fr-FR");

    expect(xml).toContain("<loc>https://amanor.example/fr/contact/room</loc>");
    expect(xml).not.toContain("https://amanor.example/contact/room<");
  });

  it("drops The Room when P13 is unpublished", async () => {
    getPublicContent.mockImplementation((input: { documentId: string }) =>
      input.documentId === "contact"
        ? { status: "unavailable" as const }
        : available(),
    );

    const xml = await localeSitemap("en-GB");

    expect(xml).not.toContain("/contact/room");
  });

  it("drops The Room when P13 is marked noindex", async () => {
    getPublicContent.mockImplementation((input: { documentId: string }) =>
      input.documentId === "contact"
        ? available({ seo: { noIndex: true } })
        : available(),
    );

    const xml = await localeSitemap("en-GB");

    expect(xml).not.toContain("/contact/room");
  });
});
