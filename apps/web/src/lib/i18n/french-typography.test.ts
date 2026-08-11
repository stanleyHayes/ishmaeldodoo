import { describe, expect, it } from "vitest";
import { formatFrenchText, typographyForLocale } from "./french-typography";

describe("French typography", () => {
  it("uses non-breaking spaces for French punctuation and guillemets", () => {
    expect(formatFrenchText("Pourquoi? Réponse : oui; vraiment! «exact»")).toBe(
      "Pourquoi\u00a0? Réponse\u00a0: oui\u00a0; vraiment\u00a0! «\u00a0exact\u00a0»",
    );
  });

  it("preserves URLs, email addresses, dates and English projections", () => {
    const date = new Date("2026-08-10T00:00:00.000Z");
    const french = typographyForLocale(
      {
        title: "Question?",
        url: "https://example.test/path?query=value",
        email: "desk@example.test",
        date,
      },
      "fr-FR",
    );
    expect(french).toEqual({
      title: "Question\u00a0?",
      url: "https://example.test/path?query=value",
      email: "desk@example.test",
      date,
    });
    const english = { title: "Question?" };
    expect(typographyForLocale(english, "en-GB")).toBe(english);
  });
});
