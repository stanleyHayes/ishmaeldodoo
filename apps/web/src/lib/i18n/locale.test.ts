import { describe, expect, it } from "vitest";
import {
  localeFromPathname,
  localizePath,
  preferredLocale,
  safeReturnPath,
} from "./locale";

describe("locale routing", () => {
  it("negotiates weighted French and English preferences", () => {
    expect(preferredLocale("fr-FR,fr;q=0.9,en;q=0.7")).toBe("fr-FR");
    expect(preferredLocale("fr;q=0.4,en-GB;q=0.8")).toBe("en-GB");
    expect(preferredLocale("de-DE,*;q=0.5")).toBe("en-GB");
    expect(preferredLocale(null)).toBe("en-GB");
  });

  it("maps reciprocal paths without duplicating locale prefixes", () => {
    expect(localeFromPathname("/fr/record")).toBe("fr-FR");
    expect(localeFromPathname("/record")).toBe("en-GB");
    expect(localizePath("/record", "fr-FR")).toBe("/fr/record");
    expect(localizePath("/fr/record", "en-GB")).toBe("/record");
    expect(localizePath("/fr", "fr-FR")).toBe("/fr");
    expect(localizePath("/fr?view=brief", "fr-FR")).toBe("/fr?view=brief");
    expect(localizePath("/fr/record?view=brief", "en-GB")).toBe(
      "/record?view=brief",
    );
  });

  it("rejects external, oversized, control-character and backslash return paths", () => {
    expect(safeReturnPath("//attacker.example/path")).toBe("/");
    expect(safeReturnPath("/safe\\redirect")).toBe("/");
    expect(safeReturnPath("/safe\u0000redirect")).toBe("/");
    expect(safeReturnPath(`/${"a".repeat(2_049)}`)).toBe("/");
    expect(safeReturnPath("/record?view=brief")).toBe("/record?view=brief");
  });
});
