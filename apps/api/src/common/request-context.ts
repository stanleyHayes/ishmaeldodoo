import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { httpMetrics, normalizeMetricPath } from "./http-metrics";
import {
  finishHttpServerSpan,
  startHttpServerSpan,
  traceparentForSpan,
} from "./telemetry";
import { parseTraceParent } from "./trace-context";

const requestIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;

export function normalizeRequestId(value: unknown): string {
  return typeof value === "string" && requestIdPattern.test(value)
    ? value
    : randomUUID();
}

export function redactLogValue(key: string, value: unknown): unknown {
  if (
    /authorization|cookie|password|secret|token|email|phone|body|payload/iu.test(
      key,
    )
  )
    return "[REDACTED]";
  return value;
}

export function requestContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = normalizeRequestId(request.headers["x-request-id"]);
  const normalizedPath = normalizeMetricPath(request.path);
  const parent = parseTraceParent(request.headers.traceparent);
  const span = startHttpServerSpan(
    request.method,
    normalizedPath,
    request.headers.traceparent,
  );
  const spanContext = span.spanContext();
  const traceparent = traceparentForSpan(span);
  response.locals.requestId = requestId;
  response.locals.trace = {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceparent,
  };
  response.setHeader("X-Request-ID", requestId);
  response.setHeader("traceparent", traceparent);
  const startedAt = performance.now();
  response.once("finish", () => {
    const durationSeconds = (performance.now() - startedAt) / 1000;
    httpMetrics.observe(
      request.method,
      request.path,
      response.statusCode,
      durationSeconds,
    );
    finishHttpServerSpan(span, response.statusCode);
    const event = {
      level: "info",
      event: "http_request_completed",
      service: "amanor-api",
      requestId,
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      ...(parent ? { parentSpanId: parent.spanId } : {}),
      method: request.method,
      path: normalizedPath,
      statusCode: response.statusCode,
      durationMs: Math.round(durationSeconds * 100_000) / 100,
    };
    process.stdout.write(`${JSON.stringify(event, redactLogValue)}\n`);
  });
  next();
}
