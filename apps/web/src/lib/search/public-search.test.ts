import { describe, expect, it } from "vitest";
import { normalizeSearchQuery, searchPublicCatalogue } from "./public-search";

describe("public search catalogue", () => {
  it("bounds and normalizes queries", () => {
    expect(normalizeSearchQuery("  source   register  ")).toBe(
      "source register",
    );
    expect(normalizeSearchQuery("x".repeat(150))).toHaveLength(100);
  });

  it("returns only locale-correct public destinations", () => {
    expect(searchPublicCatalogue("source register", "en-GB")).toContainEqual(
      expect.objectContaining({
        href: "/record/sources",
        title: "Source Register",
      }),
    );
    expect(searchPublicCatalogue("confidentialité", "fr-FR")).toContainEqual(
      expect.objectContaining({
        href: "/fr/legal/privacy",
        title: "Avis de confidentialité",
      }),
    );
  });

  it("does not expose private or administrative surfaces", () => {
    const destinations = ["room", "admin", "protocol decision", "ciphertext"]
      .flatMap((query) => searchPublicCatalogue(query, "en-GB"))
      .map((result) => result.href);
    expect(destinations).not.toContain("/contact/room");
    expect(destinations).not.toContain("/protocol-decision");
    expect(destinations.every((href) => !href.startsWith("/admin"))).toBe(true);
  });
});
