import { describe, expect, it } from "vitest";
import { securityEventHash, type SecurityEvent } from "./security-event";

describe("security event integrity", () => {
  it("binds every safe field and the previous event hash", () => {
    const event: SecurityEvent = {
      eventId: "event-1",
      type: "login_succeeded",
      subjectId: "user-1",
      occurredAt: new Date("2026-08-10T00:00:00.000Z"),
      outcome: "success",
    };
    const digest = securityEventHash(event, "previous");
    expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      securityEventHash({ ...event, outcome: "failure" }, "previous"),
    ).not.toBe(digest);
    expect(securityEventHash(event, "different")).not.toBe(digest);
  });
});
