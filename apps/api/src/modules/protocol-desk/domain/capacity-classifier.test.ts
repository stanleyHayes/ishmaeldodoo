import { describe, expect, it } from "vitest";
import {
  capacityClassifierVersion,
  classifyCapacity,
} from "./capacity-classifier";

describe("conservative Protocol Desk capacity classifier", () => {
  it("preserves explicit capacity and applies the official firewall prompts", () => {
    expect(classifyCapacity({ capacity: "official" })).toEqual({
      classification: "official",
      basis: "explicit",
      signals: ["requester:official"],
      prompts: ["official_channel_required", "honorarium_suppressed"],
      requiresHumanReview: false,
      version: capacityClassifierVersion,
    });
    expect(classifyCapacity({ capacity: "personal" })).toMatchObject({
      classification: "personal",
      prompts: [],
      requiresHumanReview: false,
    });
  });

  it.each([
    [
      "Partnership invitation from the 24-Hour Economy Authority",
      "Host institution",
      "official:24-hour-economy",
    ],
    [
      "A keynote connected to the Office of the President",
      "Government programme",
      "official:presidency",
    ],
    [
      "Development finance conversation",
      "The public office commissioning the event",
      "official:public-office",
    ],
  ])(
    "elevates official signals without auto-confirming the request",
    (context, funding, signal) => {
      expect(
        classifyCapacity({ capacity: "unsure", context, funding }),
      ).toMatchObject({
        classification: "official",
        signals: expect.arrayContaining([signal]),
        prompts: expect.arrayContaining([
          "official_channel_required",
          "honorarium_suppressed",
        ]),
        requiresHumanReview: true,
      });
    },
  );

  it("recognises only strong personal wording and still requires confirmation", () => {
    expect(
      classifyCapacity({
        capacity: "unsure",
        context: "Invitation in his personal capacity",
        funding: "Independent host",
      }),
    ).toMatchObject({
      classification: "personal",
      prompts: ["capacity_confirmation_required"],
      requiresHumanReview: true,
    });
  });

  it("does not guess from vague text or treat casing/Unicode as a bypass", () => {
    expect(
      classifyCapacity({
        capacity: "unsure",
        context: "Leadership conversation",
        funding: "Event host",
      }).classification,
    ).toBe("review");
    expect(
      classifyCapacity({
        capacity: "unsure",
        context: "GOVERNMENT briefing",
        funding: "Host",
      }),
    ).toMatchObject({ classification: "official", requiresHumanReview: true });
  });
});
