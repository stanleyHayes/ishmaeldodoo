import { describe, expect, it } from "vitest";
import { publicMetadata } from "./metadata";

describe("publicMetadata", () => {
  it("publishes canonical, reciprocal locale and social discovery metadata", () => {
    const metadata = publicMetadata({
      title: "Approved record",
      description: "Approved description",
      canonical: "/fr/record",
      languages: {
        "en-GB": "/record",
        "fr-FR": "/fr/record",
        "x-default": "/record",
      },
      locale: "fr-FR",
      indexable: true,
      indexingEnabled: true,
    });

    expect(metadata.alternates).toEqual({
      canonical: "/fr/record",
      languages: {
        "en-GB": "/record",
        "fr-FR": "/fr/record",
        "x-default": "/record",
      },
      types: { "application/atom+xml": "/fr/feed.xml" },
    });
    expect(metadata.openGraph).toMatchObject({
      locale: "fr_FR",
      alternateLocale: ["en_GB"],
      title: "Approved record",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it("uses a neutral fallback and blocks indexing without approved content", () => {
    const metadata = publicMetadata({
      canonical: "/",
      languages: { "en-GB": "/", "x-default": "/" },
      locale: "en-GB",
      indexable: false,
    });

    expect(metadata.title).toBe("Project AMANOR");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("overrides route indexability when deployment indexing is disabled", () => {
    const metadata = publicMetadata({
      canonical: "/record",
      languages: { "en-GB": "/record", "x-default": "/record" },
      locale: "en-GB",
      indexable: true,
      indexingEnabled: false,
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).not.toHaveProperty("types");
  });
});
