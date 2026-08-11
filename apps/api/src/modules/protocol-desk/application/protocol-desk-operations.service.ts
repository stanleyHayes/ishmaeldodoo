import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import type { Connection } from "mongoose";
import type { ProtocolDeskOperations } from "@amanor/contracts";
import { httpMetrics } from "../../../common/http-metrics";
import { hasPermission, type Role } from "../../auth/domain/roles";
import type { CorrespondenceJob } from "../domain/correspondence";
import { shouldCancelScheduledJob } from "../domain/correspondence";
import type {
  EngagementRequest,
  RequestState,
} from "../domain/engagement-request";
import { requestStates } from "../domain/engagement-request";
import type { CalendarSyncJob } from "../domain/calendar-sync";
import type { PrincipalDecisionDelivery } from "../domain/principal-decision-delivery";

type Escalation = Readonly<{
  escalationId: string;
  deduplicationKey: string;
  type: "initial_response_overdue" | "delivery_failure";
  severity: "ticket" | "page";
  requestId: string;
  reference: string;
  correspondenceId: string;
  openedAt: Date;
  dueAt: Date;
  attempts: number;
  status: "open" | "resolved";
  resolvedAt?: Date;
}>;

const terminalStates: readonly RequestState[] = [
  "declined",
  "lapsed",
  "archived",
];

@Injectable()
export class ProtocolDeskOperationsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(ProtocolDeskOperationsService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), 60_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh(now = new Date()): Promise<void> {
    if (this.running || !this.connection.db) return;
    this.running = true;
    try {
      const jobs = await this.correspondence()
        .find({
          $or: [
            {
              template: "status-update",
              availableAt: { $lte: now },
              status: { $in: ["pending", "processing", "failed"] },
            },
            { status: "failed", attempts: { $gte: 2 } },
          ],
        })
        .toArray();
      const activeKeys = new Set<string>();
      for (const job of jobs) {
        const request = await this.requests().findOne({
          requestId: job.requestId,
        });
        if (
          !request ||
          terminalStates.includes(request.state) ||
          shouldCancelScheduledJob(job.template, request.state)
        )
          continue;
        const types: Escalation["type"][] = [];
        if (job.template === "status-update" && job.availableAt <= now)
          types.push("initial_response_overdue");
        if (job.status === "failed" && job.attempts >= 2)
          types.push("delivery_failure");
        for (const type of types) {
          const key = `${type}:${job.correspondenceId}`;
          activeKeys.add(key);
          const existing = await this.escalations().findOne({
            deduplicationKey: key,
          });
          if (!existing)
            this.logger.error(
              `Protocol Desk ${type} escalation opened for ${job.reference}; alert required`,
            );
          await this.escalations().updateOne(
            { deduplicationKey: key },
            {
              $set: {
                type,
                severity: type === "delivery_failure" ? "page" : "ticket",
                requestId: job.requestId,
                reference: job.reference,
                correspondenceId: job.correspondenceId,
                dueAt: job.availableAt,
                attempts: job.attempts,
                status: "open",
              },
              $setOnInsert: {
                escalationId: randomUUID(),
                deduplicationKey: key,
                openedAt: now,
              },
              $unset: { resolvedAt: "" },
            },
            { upsert: true },
          );
        }
      }
      await this.escalations().updateMany(
        {
          status: "open",
          ...(activeKeys.size
            ? { deduplicationKey: { $nin: [...activeKeys] } }
            : {}),
        },
        { $set: { status: "resolved", resolvedAt: now } },
      );
      await this.updateMetrics(now);
    } finally {
      this.running = false;
    }
  }

  async snapshot(
    roles: readonly Role[],
    now = new Date(),
  ): Promise<ProtocolDeskOperations> {
    if (!hasPermission(roles, "desk:operate"))
      throw new Error("Protocol Desk operator role is required");
    await this.refresh(now);
    const [
      stateRows,
      openEscalations,
      pending,
      failed,
      oldest,
      pendingCalendarSync,
      failedCalendarSync,
      pendingPrincipalDecisionDeliveries,
      failedPrincipalDecisionDeliveries,
    ] = await Promise.all([
      this.requests()
        .aggregate<{ _id: RequestState; count: number }>([
          { $group: { _id: "$state", count: { $sum: 1 } } },
        ])
        .toArray(),
      this.escalations()
        .find({ status: "open" }, { projection: { _id: 0 } })
        .sort({ openedAt: 1 })
        .limit(100)
        .toArray(),
      this.correspondence().countDocuments({
        status: { $in: ["pending", "processing"] },
      }),
      this.correspondence().countDocuments({ status: "failed" }),
      this.correspondence().findOne(
        { status: { $in: ["pending", "processing"] } },
        { sort: { availableAt: 1 } },
      ),
      this.calendarSync().countDocuments({
        status: { $in: ["pending", "processing"] },
      }),
      this.calendarSync().countDocuments({ status: "failed" }),
      this.principalDecisionDeliveries().countDocuments({
        status: { $in: ["pending", "processing"] },
      }),
      this.principalDecisionDeliveries().countDocuments({ status: "failed" }),
    ]);
    const requestsByState = Object.fromEntries(
      stateRows.map((row) => [row._id, row.count]),
    ) as Partial<Record<RequestState, number>>;
    return {
      generatedAt: now,
      requestsByState,
      openEscalations: openEscalations.map((item) => ({
        escalationId: item.escalationId,
        type: item.type,
        severity: item.severity,
        requestId: item.requestId,
        reference: item.reference,
        correspondenceId: item.correspondenceId,
        openedAt: item.openedAt,
        dueAt: item.dueAt,
        attempts: item.attempts,
      })),
      overdueInitialResponses: openEscalations.filter(
        (item) => item.type === "initial_response_overdue",
      ).length,
      failedCorrespondence: failed,
      pendingCorrespondence: pending,
      failedCalendarSync,
      pendingCalendarSync,
      failedPrincipalDecisionDeliveries,
      pendingPrincipalDecisionDeliveries,
      oldestPendingSeconds: oldest
        ? Math.max(0, (now.getTime() - oldest.availableAt.getTime()) / 1_000)
        : 0,
    };
  }

  private async updateMetrics(now: Date): Promise<void> {
    const stateRows = await this.requests()
      .aggregate<{ _id: RequestState; count: number }>([
        { $group: { _id: "$state", count: { $sum: 1 } } },
      ])
      .toArray();
    for (const state of requestStates)
      httpMetrics.setGauge(
        "amanor_protocol_desk_requests",
        stateRows.find((row) => row._id === state)?.count ?? 0,
        { state },
      );
    const escalations = await this.escalations()
      .aggregate<{ _id: Escalation["type"]; count: number }>([
        { $match: { status: "open" } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ])
      .toArray();
    for (const type of [
      "initial_response_overdue",
      "delivery_failure",
    ] as const)
      httpMetrics.setGauge(
        "amanor_protocol_desk_open_escalations",
        escalations.find((row) => row._id === type)?.count ?? 0,
        { type },
      );
    const oldest = await this.correspondence().findOne(
      { status: { $in: ["pending", "processing"] } },
      { sort: { availableAt: 1 } },
    );
    httpMetrics.setGauge(
      "amanor_protocol_desk_oldest_pending_seconds",
      oldest
        ? Math.max(0, (now.getTime() - oldest.availableAt.getTime()) / 1_000)
        : 0,
    );
    for (const status of ["pending", "processing", "failed"] as const)
      httpMetrics.setGauge(
        "amanor_protocol_desk_calendar_sync_jobs",
        await this.calendarSync().countDocuments({ status }),
        { status },
      );
    for (const status of ["pending", "processing", "failed"] as const)
      httpMetrics.setGauge(
        "amanor_protocol_desk_principal_decision_deliveries",
        await this.principalDecisionDeliveries().countDocuments({ status }),
        { status },
      );
  }

  private requests(): Collection<EngagementRequest> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection("protocol_requests");
  }
  private correspondence(): Collection<CorrespondenceJob> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection("correspondence");
  }
  private calendarSync(): Collection<CalendarSyncJob> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection("calendar_sync_jobs");
  }
  private principalDecisionDeliveries(): Collection<PrincipalDecisionDelivery> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection(
      "protocol_principal_decision_deliveries",
    );
  }
  private escalations(): Collection<Escalation> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection("protocol_sla_escalations");
  }
}
