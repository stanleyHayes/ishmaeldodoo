import { createHash, randomUUID } from "node:crypto";
import type { EngagementRequest } from "./engagement-request";

export type CalendarSyncJob = Readonly<{
  syncId: string;
  requestId: string;
  operation: "upsert";
  status: "pending" | "processing" | "failed" | "completed";
  attempts: number;
  availableAt: Date;
  createdAt: Date;
  lockedAt?: Date;
  completedAt?: Date;
  providerEventId?: string;
  payloadHash?: string;
  lastError?: string;
}>;

export function calendarSyncJob(
  requestId: string,
  now = new Date(),
): CalendarSyncJob {
  return {
    syncId: randomUUID(),
    requestId,
    operation: "upsert",
    status: "pending",
    attempts: 0,
    availableAt: now,
    createdAt: now,
  };
}

export function calendarEventPayload(
  request: EngagementRequest,
  calendarId: string,
): Readonly<{
  calendarId: string;
  idempotencyKey: string;
  externalReference: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  location?: string;
}> {
  const endsAt =
    request.engagement.endsAt ??
    new Date(request.engagement.startsAt.getTime() + 2 * 60 * 60 * 1_000);
  const location = [request.engagement.venue, request.engagement.city]
    .filter(Boolean)
    .join(", ");
  return {
    calendarId,
    idempotencyKey: `protocol-desk:${request.requestId}`,
    externalReference: request.reference,
    summary: request.engagement.eventName,
    startsAt: request.engagement.startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    ...(location ? { location } : {}),
  };
}

export function calendarPayloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
