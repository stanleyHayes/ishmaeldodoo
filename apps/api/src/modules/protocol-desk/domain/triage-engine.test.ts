import { describe, expect, it } from "vitest";
import { createRequest, screenRequest } from "./engagement-request";
import { assessTriage } from "./triage-engine";

const input = {
  locale: "en-GB",
  capacity: "personal",
  organisation: {
    name: "African Forum",
    type: "multilateral",
    country: "GH",
    website: "https://forum.example",
    convenors: "Regional investors",
  },
  requester: {
    name: "Ama Mensah",
    role: "Director",
    email: "ama@forum.example",
  },
  engagement: {
    type: "keynote",
    eventName: "Finance Forum",
    startsAt: "2026-12-01T09:00:00Z",
    city: "Accra",
    country: "SL",
    format: "in_person",
    language: "english",
    audienceSize: 200,
    audienceDescription: "Ministers and investment leaders",
  },
  ask: {
    proposedTheme: "Financing transformation",
    objective: "Connect capital with development outcomes.",
    otherSpeakers: "Regional principals",
    recording: false,
  },
  logistics: {
    travel: "host_covered",
    honorarium: "discuss",
    invitationLetter: true,
    visaLetter: false,
    governmentProtocol: false,
    otherPrincipals: true,
    contactName: "Kojo Annan",
    contactPhone: "+233200000000",
  },
  consent: {
    dataProcessing: true,
    authorityToInvite: true,
    version: "2026-08",
  },
} as const;

describe("Protocol Desk advisory triage", () => {
  it("scores all five weighted dimensions without making a decision", () => {
    const request = createRequest(
      input,
      1,
      new Date("2026-08-10T00:00:00Z"),
    ).request;
    const assessment = assessTriage(request, {
      screenedAt: new Date("2026-08-10T00:00:01Z"),
      organisationDomainVerified: true,
      approvedThemeTerms: ["financing transformation"],
      liveAgendaTerms: ["investment"],
    });
    expect(
      assessment.dimensions.map(({ key, weight }) => [key, weight]),
    ).toEqual([
      ["institutional_weight", 30],
      ["thematic_fit", 25],
      ["strategic_value", 20],
      ["feasibility", 15],
      ["completeness_verification", 10],
    ]);
    expect(assessment.score).toBeGreaterThan(70);
    expect(assessment.flags).toEqual([]);
    expect(assessment).not.toHaveProperty("decision");
  });

  it("raises every evidence-backed flag and preserves governed match provenance", () => {
    const request = createRequest(
      {
        ...input,
        engagement: {
          ...input.engagement,
          type: "advisory",
          startsAt: "2026-08-20T09:00:00Z",
        },
      },
      2,
      new Date("2026-08-10T00:00:00Z"),
    ).request;
    const assessment = assessTriage(request, {
      screenedAt: new Date("2026-08-10T00:00:01Z"),
      organisationDomainVerified: false,
      counterpartyMatches: ["African Forum"],
      sensitivityMatches: ["live procurement"],
      hasCalendarClash: true,
      previousOutcome: "declined_diary",
    });
    expect(assessment.flags.map((flag) => flag.type)).toEqual([
      "conflict",
      "lead_time",
      "unverified",
      "clash",
      "sensitivity",
      "repeat_requester",
    ]);
    expect(assessment.requiresHumanReview).toBe(true);
    expect(assessment.flags[0]?.detail).toContain("African Forum");
  });

  it("requires human conflict review for advisory requests even without a watch-list match", () => {
    const request = createRequest(
      { ...input, engagement: { ...input.engagement, type: "advisory" } },
      3,
    ).request;
    const assessment = assessTriage(request, {
      screenedAt: new Date("2026-08-10T00:00:00Z"),
      organisationDomainVerified: true,
    });
    expect(assessment.flags).toContainEqual(
      expect.objectContaining({ type: "conflict", severity: "blocking" }),
    );
  });

  it("moves only received requests to screened through a system audit event", () => {
    const request = createRequest(input, 4).request;
    const screened = screenRequest(request, {
      screenedAt: new Date("2026-08-10T00:00:00Z"),
      organisationDomainVerified: true,
    });
    expect(screened.request).toMatchObject({
      state: "screened",
      triageScore: expect.any(Number),
      triageAssessment: { version: "triage-v1-advisory" },
    });
    expect(screened.event).toMatchObject({
      fromState: "received",
      toState: "screened",
      actorId: "triage-engine",
      actorRole: "system",
    });
    expect(() =>
      screenRequest(screened.request, {
        screenedAt: new Date(),
        organisationDomainVerified: true,
      }),
    ).toThrow(/Only a received request/);
  });
});
