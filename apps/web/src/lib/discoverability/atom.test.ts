import { describe, expect, it } from "vitest";
import { archiveAtomFeed } from "./atom";

describe("Archive Atom feed", () => {
  it("escapes CMS text and emits canonical bilingual links", () => {
    const xml = archiveAtomFeed({
      baseUrl: "https://amanor.example/",
      locale: "fr-FR",
      archive: {
        items: [
          {
            documentId: "speech-1",
            slug: "public-speech",
            title: "A & B <discours>",
            type: "speech",
            date: new Date("2026-08-08T00:00:00.000Z"),
            publishedAt: new Date("2026-08-09T00:00:00.000Z"),
            language: "fr",
            transcriptStatus: "corrected",
          },
        ],
        translation: { stale: false },
      },
    });
    expect(xml).toContain('xml:lang="fr"');
    expect(xml).toContain("A &amp; B &lt;discours&gt;");
    expect(xml).toContain("https://amanor.example/fr/archive#public-speech");
    expect(xml).toContain('hreflang="en-GB"');
    expect(xml).not.toContain("<discours>");
  });

  it("uses a stable epoch update for an empty published archive", () => {
    const xml = archiveAtomFeed({
      baseUrl: "https://amanor.example",
      locale: "en-GB",
      archive: { items: [], translation: { stale: false } },
    });
    expect(xml).toContain("1970-01-01T00:00:00.000Z");
  });
});
