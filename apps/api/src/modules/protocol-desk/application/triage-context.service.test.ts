import { describe, expect, it, vi } from "vitest";
import { TriageContextService } from "./triage-context.service";

const request = {
  locale: "en-GB" as const,
  capacity: "personal" as const,
  organisation: {
    name: "Regional Development Forum",
    type: "civil_society" as const,
    country: "GH",
    website: "https://forum.example.org",
    convenors: "With the RDF Foundation and invited partners",
  },
  requester: {
    name: "Requester",
    role: "Director",
    email: "person@events.forum.example.org",
  },
  engagement: {
    type: "panel" as const,
    eventName: "Forum",
    startsAt: new Date("2026-12-01T09:00:00Z"),
    city: "Accra",
    country: "GH",
    format: "hybrid" as const,
    language: "english" as const,
    audienceSize: 100,
    audienceDescription: "Public and private sector leaders",
  },
  ask: {
    proposedTheme: "Finance",
    objective: "Discuss practical financing options for regional programmes.",
    recording: false,
  },
  logistics: {
    travel: "host_covered" as const,
    honorarium: "not_offered" as const,
    invitationLetter: true,
    visaLetter: false,
    governmentProtocol: false,
    otherPrincipals: false,
    contactName: "Contact",
    contactPhone: "+233200000000",
  },
  consent: {
    dataProcessing: true as const,
    authorityToInvite: true as const,
    version: "2026-08",
  },
};

describe("TriageContextService", () => {
  it("matches governed aliases from exact published locale versions", async () => {
    const publications = [
      {
        documentType: "counterparty",
        documentId: "rdf",
        locale: "en-GB",
        version: 2,
      },
    ];
    const versions = [
      {
        documentType: "counterparty",
        documentId: "rdf",
        version: 2,
        state: "published",
        payload: {
          organisationCanonical: "Regional Development Fund",
          aliases: ["RDF Foundation"],
          country: "GH",
          status: "restricted",
          rationale: "Prospective counterparty",
          reviewedAt: new Date("2026-08-01"),
          reviewDueAt: new Date("2027-08-01"),
          sourceRefs: ["source-1"],
        },
      },
    ];
    const collection = vi.fn((name: string) => ({
      find: vi.fn().mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue(name === "publications" ? publications : versions),
      }),
      findOne: vi.fn().mockResolvedValue(
        name === "publications"
          ? {
              documentType: "deskConfiguration",
              documentId: "protocol-desk",
              locale: "en-GB",
              version: 1,
            }
          : {
              payload: {
                singletonKey: "protocol-desk",
                sensitivityTerms: ["practical financing"],
                approvedThemeTerms: ["finance"],
                liveAgendaTerms: ["regional programmes"],
              },
            },
      ),
    }));
    const service = new TriageContextService(
      { db: { collection } } as never,
      {
        conflicts: vi
          .fn()
          .mockResolvedValue([{ type: "blackout", reference: "travel" }]),
      } as never,
    );

    await expect(
      service.forSubmission(request, new Date("2026-08-10T00:00:00Z")),
    ).resolves.toMatchObject({
      organisationDomainVerified: true,
      counterpartyMatches: ["Regional Development Fund"],
      hasCalendarClash: true,
      sensitivityMatches: ["practical financing"],
      approvedThemeTerms: ["finance"],
      liveAgendaTerms: ["regional programmes"],
    });
  });

  it("does not treat a clear record as a conflict", async () => {
    const collection = vi.fn((name: string) => ({
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(
          name === "publications"
            ? [{ documentId: "clear", version: 1 }]
            : [
                {
                  documentId: "clear",
                  version: 1,
                  state: "published",
                  payload: {
                    organisationCanonical: "Regional Development Forum",
                    aliases: [],
                    country: "GH",
                    status: "clear",
                    rationale: "Reviewed and clear",
                    reviewedAt: new Date("2026-08-01"),
                    reviewDueAt: new Date("2027-08-01"),
                    sourceRefs: ["source-1"],
                  },
                },
              ],
        ),
      }),
      findOne: vi.fn().mockResolvedValue(null),
    }));
    const service = new TriageContextService(
      { db: { collection } } as never,
      { conflicts: vi.fn().mockResolvedValue([]) } as never,
    );

    const context = await service.forSubmission(request);
    expect(context.counterpartyMatches).toEqual([]);
  });
});
