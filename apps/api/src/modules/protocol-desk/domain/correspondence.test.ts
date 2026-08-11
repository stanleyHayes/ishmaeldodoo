import { describe, expect, it } from "vitest";
import { protocolDeskTransitionInputSchema } from "@amanor/contracts";
import {
  renderCorrespondenceTemplate,
  shouldCancelScheduledJob,
  submissionCorrespondence,
  transitionCorrespondence,
} from "./correspondence";
import type { EngagementRequest } from "./engagement-request";

const request = {
  requestId: "fcd6214d-58f8-46de-9c87-fd4edbddeefe",
  reference: "PD-2026-0417",
  locale: "fr-FR",
  requester: { email: "requester@example.test" },
} as EngagementRequest;

describe("Protocol Desk correspondence", () => {
  it("schedules immediate acknowledgement and a 48-hour status update", () => {
    const now = new Date("2026-08-10T10:00:00.000Z");
    const jobs = submissionCorrespondence(request, now);
    expect(jobs.map((job) => job.template)).toEqual([
      "acknowledgement",
      "status-update",
    ]);
    expect(jobs[1]?.availableAt.toISOString()).toBe("2026-08-12T10:00:00.000Z");
  });

  it.each([
    ["info_requested", undefined, "information-request"],
    ["held", undefined, "hold-placed"],
    ["accepted", undefined, "acceptance"],
    ["declined", "capacity", "decline-capacity"],
    ["declined", "fit", "decline-fit"],
    ["declined", "conflict", "decline-conflict"],
    ["delivered", undefined, "follow-up"],
  ] as const)("maps %s/%s to %s", (state, declineCategory, expected) => {
    const now = new Date("2026-08-10T10:00:00.000Z");
    const [job] = transitionCorrespondence(
      request,
      { state, declineCategory },
      now,
    );
    expect(job?.template).toBe(expected);
    if (state === "delivered")
      expect(job?.availableAt.toISOString()).toBe("2026-08-13T10:00:00.000Z");
  });

  it("cancels an obsolete status update but retains one while undecided", () => {
    expect(shouldCancelScheduledJob("status-update", "accepted")).toBe(true);
    expect(shouldCancelScheduledJob("status-update", "awaiting_decision")).toBe(
      false,
    );
  });

  it("requires a structured decline category only for declines", () => {
    expect(
      protocolDeskTransitionInputSchema.safeParse({
        state: "declined",
        reason: "The diary is full",
      }).success,
    ).toBe(false);
    expect(
      protocolDeskTransitionInputSchema.safeParse({
        state: "declined",
        reason: "A public-office conflict applies",
        declineCategory: "conflict",
      }).success,
    ).toBe(true);
    expect(
      protocolDeskTransitionInputSchema.safeParse({
        state: "held",
        reason: "Pending confirmation",
        declineCategory: "fit",
      }).success,
    ).toBe(false);
  });

  it("escapes variables in HTML, preserves text, and rejects undeclared tokens", () => {
    const rendered = renderCorrespondenceTemplate(
      {
        subject: "{{reference}}",
        bodyText: "Hello {{requesterName}}",
        bodyHtml: "<p>Hello {{requesterName}}</p>",
        allowedVariables: ["reference", "requesterName"],
      },
      {
        reference: "PD-2026-0417",
        requesterName: "<script>alert(1)</script>",
      },
    );
    expect(rendered.text).toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(() =>
      renderCorrespondenceTemplate(
        {
          subject: "{{secret}}",
          bodyText: "Body",
          bodyHtml: "<p>Body</p>",
          allowedVariables: [],
        },
        { secret: "not allowed" },
      ),
    ).toThrow(/unavailable/u);
  });
});
