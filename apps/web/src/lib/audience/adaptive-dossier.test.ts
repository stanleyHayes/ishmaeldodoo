import { describe, expect, it } from "vitest";
import {
  adaptiveOrder,
  atlasQuery,
  audienceCta,
  audienceDestination,
  audienceDestinations,
  audienceDoorsAnchor,
  audienceKey,
  audienceKeys,
} from "./adaptive-dossier";

describe("adaptive dossier model", () => {
  it("accepts only the five approved audience keys", () => {
    expect(audienceKeys.map((key) => audienceKey(key))).toEqual(audienceKeys);
    expect(audienceKey("unknown")).toBeNull();
    expect(audienceKey(["investor", "government"])).toBe("investor");
  });

  it("re-sequences every block without hiding or duplicating one", () => {
    const baseline = [...adaptiveOrder(null)].sort();
    for (const audience of audienceKeys) {
      const order = adaptiveOrder(audience);
      expect([...order].sort()).toEqual(baseline);
      expect(new Set(order).size).toBe(order.length);
    }
    expect(adaptiveOrder("investor")[0]).toBe("atlas");
  });

  it("derives shareable Atlas emphasis and one audience CTA", () => {
    expect(atlasQuery("investor")).toBe("?door=investor&theme=financing");
    expect(atlasQuery("youth")).toBe("?door=youth");
    expect(audienceCta("government")).toBe("/contact#the-room");
    expect(audienceCta("media")).toBe("/speaking/request");
  });

  it("sends each door to the block that choice promotes", () => {
    const complete = adaptiveOrder(null);
    expect(audienceDestinations(complete)).toEqual({
      government: "home-record-heading",
      investor: "atlas-preview-heading",
      media: "current-position-heading",
      youth: "home-record-heading",
      philanthropy: "home-signal-heading",
    });
    expect(audienceDestination(null, complete)).toBe("home-record-heading");
  });

  it("falls back past blocks this render did not publish", () => {
    expect(audienceDestination("media", ["record", "invitation"])).toBe(
      "home-record-heading",
    );
    expect(audienceDestination("philanthropy", ["invitation"])).toBe(
      "invitation-heading",
    );
    expect(audienceDestination("investor", [])).toBe(audienceDoorsAnchor);
  });
});
