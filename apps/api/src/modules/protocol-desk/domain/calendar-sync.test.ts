import { describe, expect, it } from "vitest";
import { createRequest } from "./engagement-request";
import {
  calendarEventPayload,
  calendarPayloadHash,
  calendarSyncJob,
} from "./calendar-sync";

const input = {
  locale: "en-GB" as const,
  capacity: "personal" as const,
  organisation: { name: "Convenor", type: "academic" as const, country: "GH" },
  requester: {
    name: "Ada Example",
    role: "Director",
    email: "ada@example.test",
  },
  engagement: {
    type: "keynote" as const,
    eventName: "Sahel Futures Forum",
    startsAt: "2026-09-01T10:00:00.000Z",
    city: "Accra",
    country: "GH",
    venue: "Conference Centre",
    format: "in_person" as const,
    language: "english" as const,
    audienceSize: 200,
    audienceDescription: "Regional policy and delivery leaders",
  },
  ask: {
    proposedTheme: "Institutional delivery",
    objective: "Share practical lessons across public institutions",
    recording: false,
  },
  logistics: {
    travel: "host_covered" as const,
    invitationLetter: true,
    visaLetter: false,
    governmentProtocol: false,
    otherPrincipals: false,
    contactName: "Ada Example",
    contactPhone: "+233200000000",
  },
  consent: {
    dataProcessing: true as const,
    authorityToInvite: true as const,
    version: "2026-08",
  },
};

describe("calendar synchronization domain", () => {
  it("creates a due, opaque and idempotent queue job", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    expect(calendarSyncJob("request-1", now)).toEqual(
      expect.objectContaining({
        requestId: "request-1",
        operation: "upsert",
        status: "pending",
        attempts: 0,
        availableAt: now,
      }),
    );
  });

  it("maps only bounded operational event data and defaults to two hours", () => {
    const request = createRequest(input, 7).request;
    const payload = calendarEventPayload(request, "principal-calendar");
    expect(payload).toEqual({
      calendarId: "principal-calendar",
      idempotencyKey: `protocol-desk:${request.requestId}`,
      externalReference: request.reference,
      summary: "Sahel Futures Forum",
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T12:00:00.000Z",
      location: "Conference Centre, Accra",
    });
    expect(JSON.stringify(payload)).not.toContain("ada@example.test");
    expect(calendarPayloadHash(payload)).toMatch(/^[a-f0-9]{64}$/u);
  });
});
