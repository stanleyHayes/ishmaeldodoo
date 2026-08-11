import { describe, expect, it, vi } from "vitest";
import { ProtocolDeskRepository } from "./protocol-desk.repository";

describe("ProtocolDeskRepository delivery reconciliation", () => {
  it.each([
    {
      kind: "correspondence" as const,
      jobCollection: "correspondence" as const,
      jobId: "correspondenceId" as const,
      reason: "Correspondence retry requested",
    },
    {
      kind: "calendar" as const,
      jobCollection: "calendar_sync_jobs" as const,
      jobId: "syncId" as const,
      reason: "Calendar synchronization retry requested",
    },
  ])(
    "commits the failed $kind reset and audit event together",
    async (fixture) => {
      const requestId = "11111111-1111-4111-8111-111111111111";
      const jobId = "22222222-2222-4222-8222-222222222222";
      const now = new Date("2026-08-11T10:00:00.000Z");
      const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
      const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
      const collections = {
        protocol_requests: {
          findOne: vi.fn().mockResolvedValue({
            requestId,
            state: "accepted",
          }),
        },
        correspondence: { updateOne },
        calendar_sync_jobs: { updateOne },
        protocol_request_events: { insertOne },
      } as const;
      const session = {
        withTransaction: async (work: () => Promise<void>) => work(),
        endSession: vi.fn(),
      };
      const repository = new ProtocolDeskRepository({
        db: {
          collection: (name: keyof typeof collections) =>
            collections[name] ?? ({} as never),
        },
        startSession: vi.fn().mockResolvedValue(session),
      } as never);
      const actor = { id: "desk-1", roles: ["desk_officer"] as const };

      if (fixture.kind === "correspondence")
        await repository.retryCorrespondence(requestId, jobId, actor, now);
      else await repository.retryCalendarSync(requestId, jobId, actor, now);

      expect(updateOne).toHaveBeenCalledWith(
        { requestId, [fixture.jobId]: jobId, status: "failed" },
        expect.objectContaining({
          $set: { status: "pending", availableAt: now, attempts: 0 },
        }),
        { session },
      );
      expect(insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId,
          category: "action",
          fromState: "accepted",
          toState: "accepted",
          actorId: actor.id,
          actorRole: "desk_officer",
          reason: fixture.reason,
          occurredAt: now,
        }),
        { session },
      );
      expect(session.endSession).toHaveBeenCalledOnce();
    },
  );

  it("commits the failed-job reset and authenticated audit event together", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    const deliveryId = "22222222-2222-4222-8222-222222222222";
    const now = new Date("2026-08-11T10:00:00.000Z");
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const collections = {
      protocol_requests: {
        findOne: vi.fn().mockResolvedValue({
          requestId,
          state: "awaiting_decision",
        }),
      },
      protocol_principal_decision_deliveries: { updateOne },
      protocol_request_events: { insertOne },
    } as const;
    const endSession = vi.fn();
    const repository = new ProtocolDeskRepository({
      db: {
        collection: (name: keyof typeof collections) =>
          collections[name] ?? ({} as never),
      },
      startSession: vi.fn().mockResolvedValue({
        withTransaction: async (work: () => Promise<void>) => work(),
        endSession,
      }),
    } as never);

    await repository.retryPrincipalDecisionDelivery(
      requestId,
      deliveryId,
      { id: "desk-1", roles: ["desk_officer"] },
      now,
    );

    expect(updateOne).toHaveBeenCalledWith(
      { requestId, deliveryId, status: "failed" },
      expect.objectContaining({
        $set: { status: "pending", availableAt: now, attempts: 0 },
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        category: "action",
        fromState: "awaiting_decision",
        toState: "awaiting_decision",
        actorId: "desk-1",
        actorRole: "desk_officer",
        reason: "Principal decision delivery retry requested",
        occurredAt: now,
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(endSession).toHaveBeenCalledOnce();
  });
});
