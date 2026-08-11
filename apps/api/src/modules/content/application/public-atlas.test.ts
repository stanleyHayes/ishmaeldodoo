import { describe, expect, it, vi } from "vitest";
import { CmsService } from "./cms.service";
const localized = (
  en: string,
  fr: string,
  status: "current" | "stale" = "current",
) => ({
  "en-GB": en,
  "fr-FR": fr,
  status: { "en-GB": "current", "fr-FR": status },
  sourceUpdatedAt: new Date("2026-08-01"),
});
describe("public Atlas projection", () => {
  it("projects only the requested locale and aggregates translation freshness", async () => {
    const repository = {
      listPublicAtlas: vi.fn().mockResolvedValue([
        {
          payload: {
            slug: "accra",
            label: localized("Accra", "Accra", "stale"),
            institution: localized("Institution", "Institution"),
            role: localized("Role", "Rôle"),
            outcomes: [localized("Outcome", "Résultat")],
            homepageProof: {
              order: 1,
              label: localized("Proof", "Preuve"),
              emphasisFor: ["media"],
            },
          },
        },
      ]),
    };
    const result = await new CmsService(repository as never).listPublicAtlas(
      "fr-FR",
    );
    expect(result.items).toEqual([
      {
        slug: "accra",
        label: "Accra",
        institution: "Institution",
        role: "Rôle",
        outcomes: ["Résultat"],
        homepageProof: {
          order: 1,
          label: "Preuve",
          emphasisFor: ["media"],
        },
      },
    ]);
    expect(result.translation).toEqual({
      stale: true,
      sourceUpdatedAt: new Date("2026-08-01"),
    });
  });
});
