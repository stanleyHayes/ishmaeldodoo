import { describe, expect, it } from "vitest";
import {
  assignRequest,
  clearRequestFlag,
  createRequest,
  createRequestNote,
  nextRequestStates,
  transitionRequest,
} from "./engagement-request";

const validInput = {
  locale: "en-GB",
  capacity: "personal",
  organisation: {
    name: "African Forum",
    type: "multilateral",
    country: "gh",
    website: "https://forum.example",
  },
  requester: { name: "Ama Mensah", role: "Director", email: "AMA@EXAMPLE.COM" },
  engagement: {
    type: "keynote",
    eventName: "Finance Forum",
    startsAt: "2026-12-01T09:00:00Z",
    city: "Accra",
    country: "gh",
    format: "in_person",
    language: "english",
    audienceSize: 200,
    audienceDescription: "Senior public and private finance leaders",
  },
  ask: {
    proposedTheme: "Financing transformation",
    objective: "Understand practical routes from ambition to investment.",
    recording: false,
  },
  logistics: {
    travel: "host_covered",
    honorarium: "discuss",
    invitationLetter: true,
    visaLetter: false,
    governmentProtocol: false,
    otherPrincipals: false,
    contactName: "Kojo Annan",
    contactPhone: "+233200000000",
  },
  consent: {
    dataProcessing: true,
    authorityToInvite: true,
    version: "2026-08",
  },
} as const;

describe("Protocol Desk request aggregate", () => {
  it("projects only structurally valid next lifecycle states", () => {
    expect(nextRequestStates("screened")).toEqual(["awaiting_decision"]);
    expect(nextRequestStates("awaiting_decision")).toEqual([
      "info_requested",
      "held",
      "accepted",
      "declined",
    ]);
    expect(nextRequestStates("archived")).toEqual([]);
  });

  it("normalises intake, issues a reference and creates the initial event", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    const result = createRequest(validInput, 17, now);
    expect(result.request.reference).toBe("PD-2026-0017");
    expect(result.request.organisation.country).toBe("GH");
    expect(result.request.requester.email).toBe("ama@example.com");
    expect(result.request.capacityAssessment).toMatchObject({
      classification: "personal",
      basis: "explicit",
    });
    expect(result.event).toMatchObject({
      fromState: null,
      toState: "received",
      actorRole: "system",
    });
  });

  it("rejects unsafe or credential-bearing organisation websites", () => {
    for (const website of [
      "http://forum.example",
      "javascript:alert(1)",
      "https://operator@forum.example/private",
      "https://operator:secret@forum.example/private",
    ]) {
      expect(
        () =>
          createRequest(
            {
              ...validInput,
              organisation: { ...validInput.organisation, website },
            },
            1,
          ),
        website,
      ).toThrow();
    }
  });

  it("rejects honorarium data through the domain for official capacity", () => {
    expect(() =>
      createRequest({ ...validInput, capacity: "official" }, 1),
    ).toThrow(/cannot record an honorarium/);
  });

  it("requires both clarifying answers when capacity is unsure", () => {
    expect(() =>
      createRequest(
        {
          ...validInput,
          capacity: "unsure",
          capacityContext: "Public programme",
        },
        1,
      ),
    ).toThrow(/Clarifying answers/);
    expect(
      createRequest(
        {
          ...validInput,
          capacity: "unsure",
          capacityContext: "Public programme",
          capacityFunding: "Host institution",
        },
        1,
      ).request.capacity,
    ).toBe("unsure");
  });

  it("enforces lifecycle order and Principal-only final decisions", () => {
    const initial = createRequest(validInput, 1).request;
    expect(() =>
      transitionRequest(
        initial,
        "accepted",
        { id: "p1", roles: ["principal"] },
        "Fit",
      ),
    ).toThrow(/not allowed/);
    const screened = transitionRequest(
      initial,
      "screened",
      { id: "system", roles: [] },
      "Automated screening complete",
    ).request;
    const awaiting = transitionRequest(
      screened,
      "awaiting_decision",
      { id: "desk", roles: ["desk_officer"] },
      "Ready for decision",
    ).request;
    expect(() =>
      transitionRequest(
        awaiting,
        "accepted",
        { id: "desk", roles: ["desk_officer"] },
        "Recommended",
      ),
    ).toThrow(/Only the Principal/);
    expect(
      transitionRequest(
        awaiting,
        "accepted",
        { id: "principal", roles: ["principal"] },
        "Accepted",
      ).event,
    ).toMatchObject({
      fromState: "awaiting_decision",
      toState: "accepted",
      actorRole: "principal",
    });
  });

  it("refuses delivery before the governed event end and permits it afterwards", () => {
    const request = {
      ...createRequest(
        {
          ...validInput,
          engagement: {
            ...validInput.engagement,
            endsAt: "2026-12-01T10:00:00Z",
          },
        },
        1,
        new Date("2026-08-01T09:00:00Z"),
      ).request,
      state: "contracted" as const,
    };
    const actor = { id: "desk", roles: ["desk_officer"] as const };

    expect(() =>
      transitionRequest(
        request,
        "delivered",
        actor,
        "Event completed",
        new Date("2026-12-01T09:59:59Z"),
      ),
    ).toThrow(/before it has ended/);
    expect(
      transitionRequest(
        request,
        "delivered",
        actor,
        "Event completed",
        new Date("2026-12-01T10:00:00Z"),
      ).event,
    ).toMatchObject({
      fromState: "contracted",
      toState: "delivered",
      actorRole: "desk_officer",
    });
  });

  it("prevents this Desk from accepting official requests and blocks uncleared conflicts", () => {
    const official = {
      ...createRequest(
        {
          ...validInput,
          capacity: "official",
          logistics: { ...validInput.logistics, honorarium: undefined },
        },
        1,
      ).request,
      state: "awaiting_decision" as const,
    };
    expect(() =>
      transitionRequest(
        official,
        "accepted",
        { id: "p", roles: ["principal"] },
        "Accept",
      ),
    ).toThrow(/cannot accept an official/);
    const personal = {
      ...createRequest(validInput, 2).request,
      state: "awaiting_decision" as const,
      flags: [
        {
          flagId: "11111111-1111-4111-8111-111111111111",
          type: "conflict" as const,
          severity: "blocking" as const,
          detail: "Watch-list match",
          raisedAt: new Date(),
        },
      ],
    };
    expect(() =>
      transitionRequest(
        personal,
        "accepted",
        { id: "p", roles: ["principal"] },
        "Accept",
      ),
    ).toThrow(/requires recorded human clearance/);
  });

  it("restricts immutable internal notes to Protocol Desk operators", () => {
    expect(
      createRequestNote("request-1", "  Confirmed moderator details. ", {
        id: "desk",
        roles: ["desk_officer"],
      }),
    ).toMatchObject({
      body: "Confirmed moderator details.",
      authorRole: "desk_officer",
    });
    expect(() =>
      createRequestNote("request-1", "Hidden note", {
        id: "editor",
        roles: ["editor"],
      }),
    ).toThrow(/Only Protocol Desk operators/);
  });

  it("records assignment as a same-state immutable audit event", () => {
    const request = createRequest(validInput, 1).request;
    const assigned = assignRequest(
      request,
      "desk-2",
      { id: "principal-1", roles: ["principal"] },
      new Date("2026-08-10T12:00:00Z"),
    );
    expect(assigned.request).toMatchObject({
      assignedTo: "desk-2",
      assignedBy: "principal-1",
    });
    expect(assigned.event).toMatchObject({
      fromState: "received",
      toState: "received",
      actorRole: "principal",
      reason: "Assigned to desk-2",
    });
    expect(() =>
      assignRequest(request, "desk-2", { id: "editor", roles: ["editor"] }),
    ).toThrow(/Only Protocol Desk operators/);
  });

  it("requires a reason and records human flag clearance without deleting the flag", () => {
    const flagId = "11111111-1111-4111-8111-111111111111";
    const request = {
      ...createRequest(validInput, 1).request,
      flags: [
        {
          flagId,
          type: "conflict" as const,
          severity: "blocking" as const,
          detail: "Match",
          raisedAt: new Date(),
        },
      ],
    };
    expect(() =>
      clearRequestFlag(request, flagId, "", {
        id: "desk",
        roles: ["desk_officer"],
      }),
    ).toThrow(/reason/);
    const cleared = clearRequestFlag(
      request,
      flagId,
      "Confirmed unrelated entity",
      { id: "desk", roles: ["desk_officer"] },
      new Date("2026-08-10T13:00:00Z"),
    );
    expect(cleared.request.flags[0]).toMatchObject({
      clearedBy: "desk",
      clearanceReason: "Confirmed unrelated entity",
      clearedAt: expect.any(Date),
    });
    expect(cleared.event.reason).toContain("Cleared conflict flag");
  });
});
