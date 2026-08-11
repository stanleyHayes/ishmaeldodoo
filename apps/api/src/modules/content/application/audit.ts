import { createHash, randomUUID } from "node:crypto";

export type EditorialAuditEvent = Readonly<{
  eventId: string;
  documentType: string;
  documentId: string;
  version?: number;
  actorId: string;
  action: string;
  sequence: number;
  occurredAt: Date;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  changes: readonly EditorialAuditChange[];
  previousEventHash?: string;
  eventHash: string;
}>;

export type EditorialAuditChange = Readonly<{
  path: string;
  before?: unknown;
  after?: unknown;
}>;

export type EditorialAuditInput = Omit<
  EditorialAuditEvent,
  "eventId" | "occurredAt" | "eventHash" | "previousEventHash" | "sequence"
>;

export function createEditorialAuditEvent(
  input: Omit<EditorialAuditEvent, "eventId" | "occurredAt" | "eventHash">,
  now = new Date(),
): EditorialAuditEvent {
  const eventId = randomUUID();
  const event = {
    ...input,
    eventId,
    occurredAt: now,
  };
  return { ...event, eventHash: calculateEditorialAuditHash(event) };
}

export function calculateEditorialAuditHash(
  event: Omit<EditorialAuditEvent, "eventHash">,
): string {
  const canonical = JSON.stringify({
    eventId: event.eventId,
    documentType: event.documentType,
    documentId: event.documentId,
    version: event.version ?? null,
    actorId: event.actorId,
    action: event.action,
    sequence: event.sequence,
    occurredAt: event.occurredAt.toISOString(),
    metadata: event.metadata,
    changes: event.changes,
    previousEventHash: event.previousEventHash ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, comparable(item)]),
    );
  return value;
}

export function createEditorialDiff(
  before: unknown,
  after: unknown,
  path = "",
  changes: EditorialAuditChange[] = [],
): readonly EditorialAuditChange[] {
  if (changes.length >= 500) return changes;
  const left = comparable(before);
  const right = comparable(after);
  if (JSON.stringify(left) === JSON.stringify(right)) return changes;
  const leftRecord =
    left && typeof left === "object" && !Array.isArray(left)
      ? (left as Record<string, unknown>)
      : undefined;
  const rightRecord =
    right && typeof right === "object" && !Array.isArray(right)
      ? (right as Record<string, unknown>)
      : undefined;
  if (leftRecord && rightRecord) {
    const keys = [
      ...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]),
    ].sort();
    for (const key of keys)
      createEditorialDiff(
        leftRecord[key],
        rightRecord[key],
        `${path}/${escapePointer(key)}`,
        changes,
      );
    return changes;
  }
  changes.push({
    path: path || "/",
    ...(before === undefined ? {} : { before: left }),
    ...(after === undefined ? {} : { after: right }),
  });
  return changes;
}
