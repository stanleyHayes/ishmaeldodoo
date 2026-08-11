import { describe, expect, it, vi } from "vitest";
import { CmsService } from "./cms.service";

const localized = (en: string, fr: string, status = "current") => ({
  "en-GB": en,
  "fr-FR": fr,
  status: { "en-GB": "current", "fr-FR": status },
  sourceUpdatedAt: new Date("2026-08-01"),
});

describe("public Speaking projection", () => {
  it("projects only the requested locale and preserves publication identity", async () => {
    const repository = {
      listPublicSpeakingThemes: vi.fn().mockResolvedValue([
        {
          documentId: "public-value",
          publishedAt: new Date("2026-08-09"),
          payload: {
            slug: "public-value",
            title: localized("Public value", "Valeur publique", "stale"),
            summary: localized("A practical theme", "Un thème pratique"),
            audiences: [
              localized("Programme directors", "Directeurs de programme"),
            ],
            formats: ["keynote"],
            sourceRefs: ["SRC-001"],
            relatedNodes: [],
            featured: true,
            history: [
              {
                slug: "forum-2026",
                title: localized("Regional forum", "Forum régional"),
                host: localized(
                  "Public Value Forum",
                  "Forum de la valeur publique",
                ),
                date: new Date("2026-07-01"),
                country: "GH",
                format: "keynote",
                sourceRefs: ["SRC-001"],
              },
              {
                slug: "summit-2025",
                title: localized(
                  "Delivery summit",
                  "Sommet de la mise en œuvre",
                ),
                host: localized("Delivery Network", "Réseau de mise en œuvre"),
                date: new Date("2025-11-01"),
                country: "SN",
                format: "keynote",
                sourceRefs: ["SRC-001"],
              },
            ],
          },
        },
      ]),
    };

    const result = await new CmsService(
      repository as never,
    ).listPublicSpeakingThemes("fr-FR");
    expect(result.items).toEqual([
      expect.objectContaining({
        documentId: "public-value",
        title: "Valeur publique",
        audiences: ["Directeurs de programme"],
        history: expect.arrayContaining([
          expect.objectContaining({ title: "Forum régional" }),
        ]),
        publishedAt: new Date("2026-08-09"),
      }),
    ]);
    expect(result.translation).toEqual({
      stale: true,
      sourceUpdatedAt: new Date("2026-08-01"),
    });
  });
});
