import { describe, expect, it, vi } from "vitest";
import { ProtocolDeskService } from "./protocol-desk.service";
import type { ProtocolDeskRepository } from "../persistence/protocol-desk.repository";

const input = {
  locale: "fr-FR",
  capacity: "personal",
  organisation: { name: "Forum Afrique", type: "civil_society", country: "sn" },
  requester: { name: "Awa Diop", role: "Directrice", email: "awa@example.org" },
  engagement: {
    type: "panel",
    eventName: "Forum du financement",
    startsAt: "2026-12-01T09:00:00Z",
    city: "Dakar",
    country: "sn",
    format: "hybrid",
    language: "french",
    interpretationProvided: true,
    audienceSize: 120,
    audienceDescription: "Dirigeants publics et investisseurs regionaux",
  },
  ask: {
    proposedTheme: "Financer la transformation",
    objective:
      "Identifier des mecanismes concrets pour financer la transformation.",
    recording: false,
  },
  logistics: {
    travel: "host_covered",
    honorarium: "not_offered",
    invitationLetter: true,
    visaLetter: false,
    governmentProtocol: false,
    otherPrincipals: false,
    contactName: "Moussa Ba",
    contactPhone: "+221700000000",
  },
  consent: {
    dataProcessing: true,
    authorityToInvite: true,
    version: "2026-08",
  },
} as const;

describe("ProtocolDeskService", () => {
  const availability = { conflicts: vi.fn().mockResolvedValue([]) } as never;
  const triageContext = {
    forSubmission: vi.fn().mockResolvedValue({
      screenedAt: new Date("2026-08-10T00:00:00Z"),
      organisationDomainVerified: false,
      counterpartyMatches: [],
      hasCalendarClash: false,
    }),
  } as never;
  it("validates and persists a bilingual request", async () => {
    const create = vi.fn().mockResolvedValue({ reference: "PD-2026-0042" });
    const service = new ProtocolDeskService(
      {
        create,
      } as unknown as ProtocolDeskRepository,
      availability,
      triageContext,
    );
    await expect(service.submit(input)).resolves.toEqual({
      reference: "PD-2026-0042",
      state: "received",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "fr-FR", capacity: "personal" }),
      undefined,
      expect.objectContaining({ screenedAt: expect.any(Date) }),
    );
  });

  it("rejects incomplete consent before persistence", async () => {
    const create = vi.fn();
    const service = new ProtocolDeskService(
      {
        create,
      } as unknown as ProtocolDeskRepository,
      availability,
      triageContext,
    );
    await expect(
      service.submit({
        ...input,
        consent: { ...input.consent, authorityToInvite: false },
      }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("exposes the queue only to Protocol Desk operators", async () => {
    const listQueue = vi.fn().mockResolvedValue({ items: [] });
    const recordQueueAccess = vi.fn();
    const service = new ProtocolDeskService(
      {
        listQueue,
        recordQueueAccess,
      } as unknown as ProtocolDeskRepository,
      availability,
      triageContext,
    );
    await expect(
      service.queue({ limit: 25 }, { id: "desk-1", roles: ["desk_officer"] }),
    ).resolves.toEqual({ items: [] });
    await expect(
      service.queue({ limit: 25 }, { id: "editor-1", roles: ["editor"] }),
    ).rejects.toThrow(/operator role/);
    expect(listQueue).toHaveBeenCalledOnce();
    expect(recordQueueAccess).toHaveBeenCalledWith([], {
      id: "desk-1",
      roles: ["desk_officer"],
    });
  });

  it("returns detail and delegates audited operator actions", async () => {
    const detail = {
      request: { requestId: "request-1" },
      events: [],
      notes: [],
    };
    const repository = {
      detail: vi.fn().mockResolvedValue(detail),
      recordAccess: vi.fn().mockResolvedValue(true),
      assign: vi.fn(),
      addNote: vi.fn(),
      transition: vi.fn(),
      clearFlag: vi.fn(),
    };
    const service = new ProtocolDeskService(
      repository as unknown as ProtocolDeskRepository,
      availability,
      triageContext,
    );
    await expect(
      service.detail("request-1", {
        id: "principal-1",
        roles: ["principal"],
      }),
    ).resolves.toBe(detail);
    expect(repository.recordAccess).toHaveBeenCalledWith(
      "request-1",
      { id: "principal-1", roles: ["principal"] },
      "Request detail viewed",
    );
    await service.assign("request-1", "desk-2", {
      id: "principal-1",
      roles: ["principal"],
    });
    await service.addNote("request-1", "Review complete", {
      id: "desk-2",
      roles: ["desk_officer"],
    });
    await service.transition("request-1", "screened", "Screened", {
      id: "desk-2",
      roles: ["desk_officer"],
    });
    await service.clearFlag("request-1", "flag-1", "Cleared", {
      id: "desk-2",
      roles: ["desk_officer"],
    });
    expect(repository.assign).toHaveBeenCalled();
    expect(repository.addNote).toHaveBeenCalled();
    expect(repository.transition).toHaveBeenCalled();
    expect(repository.clearFlag).toHaveBeenCalled();
  });

  it("does not fabricate an access event for a missing request", async () => {
    const repository = {
      recordAccess: vi.fn().mockResolvedValue(false),
      detail: vi.fn(),
    };
    const service = new ProtocolDeskService(
      repository as unknown as ProtocolDeskRepository,
      availability,
      triageContext,
    );
    await expect(
      service.detail("missing", {
        id: "desk-1",
        roles: ["desk_officer"],
      }),
    ).resolves.toBeNull();
    expect(repository.detail).not.toHaveBeenCalled();
  });

  it("rechecks governed availability immediately before acceptance", async () => {
    const repository = {
      findRequest: vi.fn().mockResolvedValue({
        engagement: { startsAt: new Date("2026-12-01T09:00:00.000Z") },
      }),
      transition: vi.fn(),
    };
    const conflicts = vi
      .fn()
      .mockResolvedValue([{ type: "blackout", reference: "travel-1" }]);
    const service = new ProtocolDeskService(
      repository as unknown as ProtocolDeskRepository,
      { conflicts } as never,
      triageContext,
    );
    await expect(
      service.transition("request-1", "accepted", "Approved", {
        id: "principal-1",
        roles: ["principal"],
      }),
    ).rejects.toThrow(/interval is unavailable/u);
    expect(repository.transition).not.toHaveBeenCalled();
    expect(conflicts).toHaveBeenCalledWith(
      expect.objectContaining({ excludeRequestId: "request-1" }),
    );
  });

  it("delegates an audited Principal delivery retry only for operators", async () => {
    const detail = { request: { requestId: "request-1" }, events: [] };
    const repository = {
      retryPrincipalDecisionDelivery: vi.fn(),
      detail: vi.fn().mockResolvedValue(detail),
    };
    const service = new ProtocolDeskService(
      repository as unknown as ProtocolDeskRepository,
      availability,
      triageContext,
    );
    const actor = { id: "desk-1", roles: ["desk_officer"] as const };
    await expect(
      service.retryPrincipalDecisionDelivery("request-1", "delivery-1", actor),
    ).resolves.toBe(detail);
    expect(repository.retryPrincipalDecisionDelivery).toHaveBeenCalledWith(
      "request-1",
      "delivery-1",
      actor,
    );
    await expect(
      service.retryPrincipalDecisionDelivery("request-1", "delivery-1", {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/operator role/u);
    expect(repository.retryPrincipalDecisionDelivery).toHaveBeenCalledOnce();
  });

  it("delegates audited correspondence and calendar retries only for operators", async () => {
    const detail = { request: { requestId: "request-1" }, events: [] };
    const repository = {
      retryCorrespondence: vi.fn(),
      retryCalendarSync: vi.fn(),
      detail: vi.fn().mockResolvedValue(detail),
    };
    const service = new ProtocolDeskService(
      repository as unknown as ProtocolDeskRepository,
      availability,
      triageContext,
    );
    const actor = { id: "desk-1", roles: ["desk_officer"] as const };
    await expect(
      service.retryCorrespondence("request-1", "message-1", actor),
    ).resolves.toBe(detail);
    await expect(
      service.retryCalendarSync("request-1", "calendar-1", actor),
    ).resolves.toBe(detail);
    expect(repository.retryCorrespondence).toHaveBeenCalledWith(
      "request-1",
      "message-1",
      actor,
    );
    expect(repository.retryCalendarSync).toHaveBeenCalledWith(
      "request-1",
      "calendar-1",
      actor,
    );
    await expect(
      service.retryCorrespondence("request-1", "message-1", {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/operator role/u);
    await expect(
      service.retryCalendarSync("request-1", "calendar-1", {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/operator role/u);
    expect(repository.retryCorrespondence).toHaveBeenCalledOnce();
    expect(repository.retryCalendarSync).toHaveBeenCalledOnce();
  });
});
