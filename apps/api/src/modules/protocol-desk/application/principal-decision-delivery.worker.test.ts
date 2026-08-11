import { describe, expect, it } from "vitest";
import { principalDecisionMessage } from "./principal-decision-delivery.worker";

describe("Principal decision delivery", () => {
  it("renders all available actions as scanner-safe fragment links", () => {
    const message = principalDecisionMessage({
      locale: "en-GB",
      reference: "PD-2026-0042",
      eventName: "Finance & Trade Forum",
      publicOrigin: "https://amanor.example/",
      tokens: {
        accept: "accept-token",
        decline: "decline-token",
        hold: "hold-token",
        request_information: "information-token",
      },
    });
    expect(message.subject).toBe("Decision required · PD-2026-0042");
    expect(message.text).toContain(
      "https://amanor.example/protocol-decision#token=accept-token&action=accept",
    );
    expect(message.text).toContain("Request information:");
    expect(message.html).toContain("Finance &amp; Trade Forum");
    expect(message.html).toContain('rel="noreferrer"');
    expect(message.html).not.toContain("?<");
  });

  it("uses the French private route and fails closed without actions", () => {
    expect(
      principalDecisionMessage({
        locale: "fr-FR",
        reference: "PD-2026-0042",
        eventName: "Forum",
        publicOrigin: "https://amanor.example",
        tokens: { decline: "token-fr" },
      }).text,
    ).toContain(
      "https://amanor.example/fr/protocol-decision#token=token-fr&action=decline",
    );
    expect(() =>
      principalDecisionMessage({
        locale: "en-GB",
        reference: "PD-2026-0042",
        eventName: "Forum",
        publicOrigin: "https://amanor.example",
        tokens: {},
      }),
    ).toThrow(/No Principal decision links/u);
  });
});
