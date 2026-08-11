import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpMetrics } from "../../../common/http-metrics";
import { ProtocolDeskOperationsService } from "./protocol-desk-operations.service";

const now = new Date("2026-08-10T12:00:00.000Z");
const overdue = {
  correspondenceId: "22222222-2222-4222-8222-222222222222",
  requestId: "11111111-1111-4111-8111-111111111111",
  reference: "PD-2026-0042",
  template: "status-update",
  locale: "en-GB",
  recipient: "private@example.test",
  status: "failed",
  attempts: 2,
  availableAt: new Date("2026-08-10T10:00:00.000Z"),
  createdAt: new Date("2026-08-08T10:00:00.000Z"),
};

function fixture(existing = false) {
  const escalation = {
    escalationId: "33333333-3333-4333-8333-333333333333",
    deduplicationKey: `initial_response_overdue:${overdue.correspondenceId}`,
    type: "initial_response_overdue",
    severity: "ticket",
    requestId: overdue.requestId,
    reference: overdue.reference,
    correspondenceId: overdue.correspondenceId,
    openedAt: now,
    dueAt: overdue.availableAt,
    attempts: 2,
    status: "open",
  } as const;
  const correspondence = {
    find: vi
      .fn()
      .mockReturnValue({ toArray: vi.fn().mockResolvedValue([overdue]) }),
    countDocuments: vi
      .fn()
      .mockImplementation((query: { status: unknown }) =>
        Promise.resolve(query.status === "failed" ? 1 : 2),
      ),
    findOne: vi.fn().mockResolvedValue(overdue),
  };
  const calendarSync = {
    countDocuments: vi
      .fn()
      .mockImplementation((query: { status: unknown }) =>
        Promise.resolve(query.status === "failed" ? 1 : 2),
      ),
  };
  const principalDecisionDeliveries = {
    countDocuments: vi
      .fn()
      .mockImplementation((query: { status: unknown }) =>
        Promise.resolve(query.status === "failed" ? 1 : 3),
      ),
  };
  const requests = {
    findOne: vi.fn().mockResolvedValue({
      requestId: overdue.requestId,
      state: "screened",
    }),
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: "screened", count: 1 }]),
    }),
  };
  const escalations = {
    findOne: vi.fn().mockResolvedValue(existing ? escalation : null),
    updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    updateMany: vi.fn().mockResolvedValue({ acknowledged: true }),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([escalation]),
        }),
      }),
    }),
    aggregate: vi.fn().mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue([{ _id: "initial_response_overdue", count: 1 }]),
    }),
  };
  const collections = {
    protocol_requests: requests,
    correspondence,
    calendar_sync_jobs: calendarSync,
    protocol_principal_decision_deliveries: principalDecisionDeliveries,
    protocol_sla_escalations: escalations,
  };
  const service = new ProtocolDeskOperationsService({
    db: {
      collection: (name: keyof typeof collections) => collections[name],
    },
  } as never);
  return { service, correspondence, requests, escalations };
}

describe("ProtocolDeskOperationsService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    httpMetrics.reset();
  });

  it("deduplicates an overdue 48-hour response and exposes a redacted snapshot", async () => {
    const { service, escalations } = fixture();
    await service.refresh(now);
    expect(escalations.updateOne).toHaveBeenCalledWith(
      {
        deduplicationKey: `initial_response_overdue:${overdue.correspondenceId}`,
      },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "open", severity: "ticket" }),
      }),
      { upsert: true },
    );
    const snapshot = await service.snapshot(["desk_officer"], now);
    expect(snapshot).toMatchObject({
      requestsByState: { screened: 1 },
      overdueInitialResponses: 1,
      failedCorrespondence: 1,
      pendingCorrespondence: 2,
      failedCalendarSync: 1,
      pendingCalendarSync: 2,
      failedPrincipalDecisionDeliveries: 1,
      pendingPrincipalDecisionDeliveries: 3,
      oldestPendingSeconds: 7200,
    });
    expect(JSON.stringify(snapshot)).not.toContain("private@example.test");
    const metrics = httpMetrics.render();
    for (const status of ["pending", "processing", "failed"])
      expect(metrics).toContain(
        `amanor_protocol_desk_principal_decision_deliveries{status="${status}"}`,
      );
    expect(metrics).not.toContain("private@example.test");
  });

  it("denies non-operators and safely refreshes an existing escalation", async () => {
    const { service, escalations } = fixture(true);
    await expect(service.snapshot(["editor"], now)).rejects.toThrow(
      /operator role/u,
    );
    await service.refresh(now);
    expect(escalations.updateMany).toHaveBeenCalled();
  });
});
