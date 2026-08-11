import { describe, expect, it } from "vitest";
import { HttpMetrics, normalizeMetricPath } from "./http-metrics";

describe("HTTP metrics", () => {
  it("normalizes identifier segments to bound label cardinality", () => {
    expect(
      normalizeMetricPath("/v1/cms/content/507f1f77bcf86cd799439011/42"),
    ).toBe("/v1/cms/content/:id/:id");
    expect(normalizeMetricPath(`/v1/${"a".repeat(200)}`)).toBe("/overflow");
  });

  it("renders cumulative Prometheus histogram series without request data", () => {
    const metrics = new HttpMetrics();
    metrics.observe("get", "/v1/health/ready", 200, 0.02);
    metrics.observe("get", "/v1/health/ready", 204, 0.2);
    const output = metrics.render();
    expect(output).toContain(
      'route="/v1/health/ready",status="2xx",le="0.025"} 1',
    );
    expect(output).toContain("amanor_http_request_duration_seconds_count");
    expect(output).toContain(" 2\n");
  });

  it("renders bounded operational gauges without high-cardinality labels", () => {
    const metrics = new HttpMetrics();
    metrics.setGauge("amanor_protocol_desk_requests", 4, {
      state: "awaiting_decision",
    });
    expect(metrics.render()).toContain(
      'amanor_protocol_desk_requests{state="awaiting_decision"} 4',
    );
    expect(() => metrics.setGauge("unsafe-metric", 1)).toThrow(/invalid/u);
  });
});
