import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("locale choice route", () => {
  it("persists an explicit choice and redirects to its reciprocal path", async () => {
    const response = await GET(
      new NextRequest("https://example.test/locale/fr-FR?returnTo=/record"),
      { params: Promise.resolve({ locale: "fr-FR" }) },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://example.test/fr/record",
    );
    expect(response.cookies.get("amanor_locale")?.value).toBe("fr-FR");
  });

  it("rejects unsupported locales and prevents external redirects", async () => {
    await expect(
      GET(new NextRequest("https://example.test/locale/de-DE"), {
        params: Promise.resolve({ locale: "de-DE" }),
      }),
    ).resolves.toMatchObject({ status: 404 });
    const response = await GET(
      new NextRequest(
        "https://example.test/locale/en-GB?returnTo=//attacker.example",
      ),
      { params: Promise.resolve({ locale: "en-GB" }) },
    );
    expect(response.headers.get("location")).toBe("https://example.test/");
  });
});
