import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../../auth/http/authenticated-request";
import type { ProtocolDeskService } from "../application/protocol-desk.service";
import { ProtocolDeskOperatorController } from "./protocol-desk-operator.controller";
import type { ConfigService } from "@nestjs/config";
import type { ProtocolNoteService } from "../application/protocol-note.service";
import type { ProtocolDeskOperationsService } from "../application/protocol-desk-operations.service";
import type { AvailabilityService } from "../application/availability.service";

const request = (
  roles: AuthenticatedRequest["auth"]["roles"],
): AuthenticatedRequest =>
  ({ auth: { subject: "operator-1", roles } }) as AuthenticatedRequest;
const configuration = {
  getOrThrow: vi.fn().mockReturnValue("https://admin.example.test"),
} as unknown as ConfigService;
const protocolNote = { generate: vi.fn() } as unknown as ProtocolNoteService;
const operations = {
  snapshot: vi.fn(),
} as unknown as ProtocolDeskOperationsService;
const availability = { check: vi.fn() } as unknown as AvailabilityService;

describe("ProtocolDeskOperatorController", () => {
  it("validates and forwards a bounded availability interval", async () => {
    const check = vi.fn().mockResolvedValue({ available: true, conflicts: [] });
    const controller = new ProtocolDeskOperatorController(
      {} as ProtocolDeskService,
      configuration,
      protocolNote,
      operations,
      { check } as unknown as AvailabilityService,
    );
    await expect(
      controller.availabilityCheck(
        {
          startsAt: "2026-12-01T09:00:00.000Z",
          endsAt: "2026-12-01T11:00:00.000Z",
        },
        request(["desk_officer"]),
      ),
    ).resolves.toMatchObject({ available: true });
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ startsAt: expect.any(Date) }),
      ["desk_officer"],
    );
    await expect(
      controller.availabilityCheck(
        {
          startsAt: "2026-12-02T09:00:00.000Z",
          endsAt: "2026-12-01T11:00:00.000Z",
        },
        request(["desk_officer"]),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns the protected operational snapshot", async () => {
    const snapshot = vi.fn().mockResolvedValue({ openEscalations: [] });
    const controller = new ProtocolDeskOperatorController(
      {} as ProtocolDeskService,
      configuration,
      protocolNote,
      { snapshot } as unknown as ProtocolDeskOperationsService,
      availability,
    );
    await expect(
      controller.operationalSnapshot(request(["principal"])),
    ).resolves.toEqual({ openEscalations: [] });
    expect(snapshot).toHaveBeenCalledWith(["principal"]);
  });

  it("validates and forwards bounded queue filters with authenticated roles", async () => {
    const queue = vi.fn().mockResolvedValue({ items: [] });
    const controller = new ProtocolDeskOperatorController(
      { queue } as unknown as ProtocolDeskService,
      configuration,
      protocolNote,
      operations,
      availability,
    );
    await expect(
      controller.queue(
        { limit: "10", state: "screened", flag: "conflict", q: "Forum" },
        request(["desk_officer"]),
      ),
    ).resolves.toEqual({ items: [] });
    expect(queue).toHaveBeenCalledWith(
      { limit: 10, state: "screened", flag: "conflict", q: "Forum" },
      { id: "operator-1", roles: ["desk_officer"] },
    );
  });

  it("rejects invalid queries and maps role failures to forbidden", async () => {
    const queue = vi
      .fn()
      .mockRejectedValue(new Error("Protocol Desk operator role is required"));
    const controller = new ProtocolDeskOperatorController(
      { queue } as unknown as ProtocolDeskService,
      configuration,
      protocolNote,
      operations,
      availability,
    );
    await expect(
      controller.queue({ limit: "101" }, request(["desk_officer"])),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.queue({}, request(["editor"])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("maps opaque malformed cursors to a safe bad request", async () => {
    const queue = vi
      .fn()
      .mockRejectedValue(new Error("Protocol Desk queue cursor is invalid"));
    const controller = new ProtocolDeskOperatorController(
      { queue } as unknown as ProtocolDeskService,
      configuration,
      protocolNote,
      operations,
      availability,
    );
    await expect(
      controller.queue({ cursor: "bad" }, request(["principal"])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires the trusted admin origin for assignment, notes and transitions", async () => {
    const detail = { request: {}, events: [], notes: [] };
    const desk = {
      assign: vi.fn().mockResolvedValue(detail),
      addNote: vi.fn().mockResolvedValue(detail),
      transition: vi.fn().mockResolvedValue(detail),
      clearFlag: vi.fn().mockResolvedValue(detail),
    };
    const controller = new ProtocolDeskOperatorController(
      desk as unknown as ProtocolDeskService,
      configuration,
      protocolNote,
      operations,
      availability,
    );
    const id = "11111111-1111-4111-8111-111111111111";
    await expect(
      controller.assign(
        id,
        { assigneeId: "desk-2" },
        request(["principal"]),
        "https://evil.example",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await controller.assign(
      id,
      { assigneeId: "desk-2" },
      request(["principal"]),
      "https://admin.example.test",
    );
    await controller.note(
      id,
      { body: "Review complete" },
      request(["desk_officer"]),
      "https://admin.example.test",
    );
    await controller.transition(
      id,
      { state: "screened", reason: "Automated screening complete" },
      request(["desk_officer"]),
      "https://admin.example.test",
    );
    await controller.clearFlag(
      id,
      "22222222-2222-4222-8222-222222222222",
      { reason: "False positive" },
      request(["desk_officer"]),
      "https://admin.example.test",
    );
    expect(desk.assign).toHaveBeenCalled();
    expect(desk.addNote).toHaveBeenCalled();
    expect(desk.transition).toHaveBeenCalled();
    expect(desk.clearFlag).toHaveBeenCalled();
  });

  it("protects and forwards a calendar reconciliation retry", async () => {
    const retryCalendarSync = vi.fn().mockResolvedValue({ calendarSync: [] });
    const controller = new ProtocolDeskOperatorController(
      { retryCalendarSync } as unknown as ProtocolDeskService,
      configuration,
      protocolNote,
      operations,
      availability,
    );
    const requestId = "11111111-1111-4111-8111-111111111111";
    const syncId = "22222222-2222-4222-8222-222222222222";
    await expect(
      controller.retryCalendarSync(
        requestId,
        syncId,
        request(["desk_officer"]),
        "https://evil.example",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await controller.retryCalendarSync(
      requestId,
      syncId,
      request(["desk_officer"]),
      "https://admin.example.test",
    );
    expect(retryCalendarSync).toHaveBeenCalledWith(requestId, syncId, {
      id: "operator-1",
      roles: ["desk_officer"],
    });
  });

  it("protects and forwards an audited correspondence retry", async () => {
    const retryCorrespondence = vi
      .fn()
      .mockResolvedValue({ correspondence: [] });
    const controller = new ProtocolDeskOperatorController(
      { retryCorrespondence } as unknown as ProtocolDeskService,
      configuration,
      protocolNote,
      operations,
      availability,
    );
    const requestId = "11111111-1111-4111-8111-111111111111";
    const correspondenceId = "22222222-2222-4222-8222-222222222222";
    await expect(
      controller.retryCorrespondence(
        requestId,
        correspondenceId,
        request(["desk_officer"]),
        "https://evil.example",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await controller.retryCorrespondence(
      requestId,
      correspondenceId,
      request(["desk_officer"]),
      "https://admin.example.test",
    );
    expect(retryCorrespondence).toHaveBeenCalledWith(
      requestId,
      correspondenceId,
      { id: "operator-1", roles: ["desk_officer"] },
    );
  });

  it("protects and forwards a failed Principal delivery retry", async () => {
    const retryPrincipalDecisionDelivery = vi
      .fn()
      .mockResolvedValue({ principalDecisionDelivery: [] });
    const controller = new ProtocolDeskOperatorController(
      {
        retryPrincipalDecisionDelivery,
      } as unknown as ProtocolDeskService,
      configuration,
      protocolNote,
      operations,
      availability,
    );
    const requestId = "11111111-1111-4111-8111-111111111111";
    const deliveryId = "33333333-3333-4333-8333-333333333333";
    await expect(
      controller.retryPrincipalDecisionDelivery(
        requestId,
        deliveryId,
        request(["desk_officer"]),
        "https://evil.example",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await controller.retryPrincipalDecisionDelivery(
      requestId,
      deliveryId,
      request(["desk_officer"]),
      "https://admin.example.test",
    );
    expect(retryPrincipalDecisionDelivery).toHaveBeenCalledWith(
      requestId,
      deliveryId,
      expect.objectContaining({ roles: ["desk_officer"] }),
    );
  });

  it("returns a private PDF only through the protected Protocol Note boundary", async () => {
    const generateStored = vi.fn().mockResolvedValue({
      body: Buffer.from("%PDF-note"),
      filename: "protocol-note-pd-2026-0042-en-GB.pdf",
    });
    const controller = new ProtocolDeskOperatorController(
      {} as ProtocolDeskService,
      configuration,
      { generateStored } as unknown as ProtocolNoteService,
      operations,
      availability,
    );
    const setHeader = vi.fn();
    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const response = { setHeader, status };
    const requestId = "11111111-1111-4111-8111-111111111111";
    await controller.generateProtocolNote(
      requestId,
      request(["desk_officer"]),
      response as never,
      "https://admin.example.test",
    );
    expect(generateStored).toHaveBeenCalledWith(requestId, ["desk_officer"]);
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(status).toHaveBeenCalledWith(201);
    expect(send).toHaveBeenCalledWith(Buffer.from("%PDF-note"));
  });

  it("issues an action-bound Principal decision capability behind auth and origin checks", async () => {
    const issuePrincipalDecisionCapability = vi.fn().mockResolvedValue({
      token: "opaque-token",
      expiresAt: new Date("2026-08-12T12:00:00.000Z"),
    });
    const controller = new ProtocolDeskOperatorController(
      { issuePrincipalDecisionCapability } as unknown as ProtocolDeskService,
      configuration,
      protocolNote,
      operations,
      availability,
    );
    const requestId = "11111111-1111-4111-8111-111111111111";
    await expect(
      controller.issuePrincipalDecisionCapability(
        requestId,
        { action: "accept" },
        request(["principal"]),
        "https://evil.example",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await controller.issuePrincipalDecisionCapability(
      requestId,
      { action: "accept" },
      request(["principal"]),
      "https://admin.example.test",
    );
    expect(issuePrincipalDecisionCapability).toHaveBeenCalledWith(
      requestId,
      "accept",
      { id: "operator-1", roles: ["principal"] },
    );
  });
});
