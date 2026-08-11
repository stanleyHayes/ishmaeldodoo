import { describe, expect, it } from "vitest";
import {
  hashDecisionToken,
  issueDecisionCapability,
  issueDeliveryDecisionCapability,
  deriveDecisionToken,
  stateForDecision,
} from "./decision-capability";

describe("Principal decision capabilities", () => {
  it("issues an opaque action-bound token and persists only its hash", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const issued = issueDecisionCapability(
      "11111111-1111-4111-8111-111111111111",
      "accept",
      "principal-1",
      now,
    );

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
    expect(issued.capability.tokenHash).toBe(hashDecisionToken(issued.token));
    expect(JSON.stringify(issued.capability)).not.toContain(issued.token);
    expect(issued.capability.expiresAt).toEqual(
      new Date("2026-08-12T12:00:00.000Z"),
    );
  });

  it("maps only the four brief-defined Principal actions", () => {
    expect(stateForDecision("accept")).toBe("accepted");
    expect(stateForDecision("decline")).toBe("declined");
    expect(stateForDecision("hold")).toBe("held");
    expect(stateForDecision("request_information")).toBe("info_requested");
  });

  it("re-derives a provider-retry-stable token while persisting only its hash", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const issued = issueDeliveryDecisionCapability(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "accept",
      "principal-1",
      key,
      new Date("2026-08-11T08:00:00.000Z"),
    );
    expect(deriveDecisionToken(issued.capability, key)).toBe(issued.token);
    expect(issued.capability.tokenHash).toBe(hashDecisionToken(issued.token));
    expect(JSON.stringify(issued.capability)).not.toContain(issued.token);
    expect(() => deriveDecisionToken(issued.capability, "invalid")).toThrow(
      /derivation key is invalid/u,
    );
  });
});
