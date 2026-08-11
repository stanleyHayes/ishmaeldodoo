import { describe, expect, it } from "vitest";
import { pageAlternates, publicPageId, publicPageRoutes } from "./public-pages";

describe("public page route registry", () => {
  it("maps every approved public and legal route to a stable CMS document", () => {
    expect(Object.keys(publicPageRoutes)).toEqual([
      "record",
      "record/atlas",
      "speaking",
      "speaking/request",
      "signals",
      "press",
      "doctrine",
      "archive",
      "legacy",
      "office-hours",
      "selah",
      "contact",
      "record/sources",
      "legal/privacy",
      "legal/terms",
      "legal/disclosure",
    ]);
    expect(publicPageId(["record", "sources"])).toBe("record-sources");
    expect(publicPageId(["unknown"])).toBeNull();
  });

  it("publishes reciprocal locale alternates with locale-specific canonicals", () => {
    expect(pageAlternates("record", "fr-FR")).toEqual({
      canonical: "/fr/record",
      languages: {
        "en-GB": "/record",
        "fr-FR": "/fr/record",
        "x-default": "/record",
      },
    });
  });
});
