import { randomBytes } from "node:crypto";

const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/u;

export type TraceContext = Readonly<{
  traceId: string;
  parentSpanId?: string;
  spanId: string;
  traceFlags: string;
  traceparent: string;
}>;

const nonZero = (value: string): boolean => !/^0+$/u.test(value);

export function parseTraceParent(value: unknown): Readonly<{
  traceId: string;
  spanId: string;
  traceFlags: string;
}> | null {
  const match =
    typeof value === "string" ? traceparentPattern.exec(value.trim()) : null;
  if (!match || !nonZero(match[1]!) || !nonZero(match[2]!)) return null;
  return { traceId: match[1]!, spanId: match[2]!, traceFlags: match[3]! };
}

export function createTraceContext(value: unknown): TraceContext {
  const parsed = parseTraceParent(value);
  const traceId = parsed?.traceId ?? randomBytes(16).toString("hex");
  const traceFlags = parsed?.traceFlags ?? "01";
  const spanId = randomBytes(8).toString("hex");
  return {
    traceId,
    ...(parsed ? { parentSpanId: parsed.spanId } : {}),
    spanId,
    traceFlags,
    traceparent: `00-${traceId}-${spanId}-${traceFlags}`,
  };
}
