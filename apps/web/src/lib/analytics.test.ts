import { describe, expect, it } from "vitest";
import { analyticsEventSchema, hasAnalyticsConsent } from "./analytics";

describe("analytics privacy contract", () => {
  it("accepts only catalogued events and bounded dimensions", () => {
    expect(
      analyticsEventSchema.safeParse({
        name: "pageview",
        route: "/record/atlas",
        locale: "fr-FR",
        mode: "lite",
      }).success,
    ).toBe(true);
    expect(
      analyticsEventSchema.safeParse({
        name: "pageview",
        route: "/record/atlas/private-record-id",
        locale: "en-GB",
      }).success,
    ).toBe(false);
    expect(
      analyticsEventSchema.safeParse({
        name: "custom",
        route: "/",
        locale: "en-GB",
        email: "a@example.test",
      }).success,
    ).toBe(false);
  });

  it("requires an exact explicit consent cookie", () => {
    expect(hasAnalyticsConsent("theme=day; amanor-analytics=granted")).toBe(
      true,
    );
    expect(hasAnalyticsConsent("amanor-analytics=denied")).toBe(false);
    expect(hasAnalyticsConsent(null)).toBe(false);
  });
});
