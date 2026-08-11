import { describe, expect, it } from "vitest";
import { projectPublicLocale, summarizeTranslation } from "./public-projection";

const localized = {
  "en-GB": "English",
  "fr-FR": "Français",
  status: { "en-GB": "current", "fr-FR": "current" },
  sourceUpdatedAt: new Date("2026-08-09T00:00:00.000Z"),
};

describe("public locale projection", () => {
  it("removes the alternate locale and editorial translation metadata recursively", () => {
    expect(
      projectPublicLocale(
        {
          title: localized,
          sections: [{ body: localized }],
          publishedAt: new Date("2026-08-09"),
        },
        "fr-FR",
      ),
    ).toEqual({
      title: "Français",
      sections: [{ body: "Français" }],
      publishedAt: new Date("2026-08-09"),
    });
  });

  it("summarizes stale locale fields and the latest source update", () => {
    expect(
      summarizeTranslation(
        {
          title: localized,
          body: {
            ...localized,
            status: { "en-GB": "current", "fr-FR": "stale" },
            sourceUpdatedAt: new Date("2026-08-10"),
          },
        },
        "fr-FR",
      ),
    ).toEqual({
      stale: true,
      sourceUpdatedAt: new Date("2026-08-10"),
    });
  });
});
