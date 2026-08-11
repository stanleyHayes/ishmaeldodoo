const requestIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/u;

function nonZero(value: string): boolean {
  return !/^0+$/u.test(value);
}

function safeRequestId(value: string | null): string | undefined {
  return value && requestIdPattern.test(value) ? value : undefined;
}

function safeTraceparent(value: string | null): string | undefined {
  if (!value) return undefined;
  const match = traceparentPattern.exec(value.trim());
  return match && nonZero(match[1]!) && nonZero(match[2]!)
    ? value.trim()
    : undefined;
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export type RequestCorrelation = Readonly<{
  requestId: string;
  traceparent: string;
}>;

export function requestCorrelation(request: Request): RequestCorrelation {
  return {
    requestId:
      safeRequestId(request.headers.get("x-request-id")) ?? crypto.randomUUID(),
    traceparent:
      safeTraceparent(request.headers.get("traceparent")) ??
      `00-${randomHex(16)}-${randomHex(8)}-01`,
  };
}

export function correlationRequestHeaders(
  correlation: RequestCorrelation,
): Record<string, string> {
  return {
    "X-Request-ID": correlation.requestId,
    traceparent: correlation.traceparent,
  };
}

export function correlationResponseHeaders(
  correlation: RequestCorrelation,
  upstream?: Response,
): Record<string, string> {
  return {
    "X-Request-ID":
      safeRequestId(upstream?.headers.get("x-request-id") ?? null) ??
      correlation.requestId,
    traceparent:
      safeTraceparent(upstream?.headers.get("traceparent") ?? null) ??
      correlation.traceparent,
  };
}
