// @vitest-environment node

import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import {
  InMemorySpanExporter,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-node";
import { afterAll, describe, expect, it } from "vitest";
import {
  configureTelemetry,
  finishHttpServerSpan,
  startHttpServerSpan,
  traceparentForSpan,
} from "./telemetry";
import { httpMetrics } from "./http-metrics";

class ToggleExporter implements SpanExporter {
  readonly memory = new InMemorySpanExporter();
  fail = false;

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (this.fail) {
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }
    this.memory.export(spans, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.memory.shutdown();
  }
}

const exporter = new ToggleExporter();
const shutdown = configureTelemetry({
  exporter,
  sampleRatio: 1,
  serviceVersion: "test-version",
});

afterAll(() => shutdown());

describe("provider-neutral API tracing", () => {
  it("exports a bounded child server span without user or request content", () => {
    const incoming = "00-11111111111111111111111111111111-2222222222222222-01";
    const span = startHttpServerSpan("post", "/v1/desk/requests/:id", incoming);
    const returned = traceparentForSpan(span);
    finishHttpServerSpan(span, 503);
    const exported = exporter.memory.getFinishedSpans();
    const exportedSpan = exported[0];
    if (!exportedSpan) throw new Error("Expected one exported span");
    expect(returned).toMatch(
      /^00-11111111111111111111111111111111-[0-9a-f]{16}-01$/u,
    );
    expect(exported).toHaveLength(1);
    expect(exportedSpan).toMatchObject({
      name: "POST /v1/desk/requests/:id",
      parentSpanContext: {
        traceId: "11111111111111111111111111111111",
        spanId: "2222222222222222",
        isRemote: true,
      },
      attributes: {
        "http.request.method": "POST",
        "http.response.status_code": 503,
        "url.path": "/v1/desk/requests/:id",
      },
      status: { code: 2 },
    });
    expect(JSON.stringify(exportedSpan.attributes)).not.toMatch(
      /authorization|cookie|email|phone|payload|requestId|token/iu,
    );
    expect(httpMetrics.render()).toContain("amanor_telemetry_export_healthy 1");
  });

  it("marks a failed batch unhealthy without throwing into the request path", () => {
    exporter.fail = true;
    const span = startHttpServerSpan("get", "/v1/health/ready", undefined);
    expect(() => finishHttpServerSpan(span, 200)).not.toThrow();
    expect(httpMetrics.render()).toContain(
      "amanor_telemetry_export_configured 1",
    );
    expect(httpMetrics.render()).toContain("amanor_telemetry_export_healthy 0");
  });
});
