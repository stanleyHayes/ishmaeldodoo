import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { httpMetrics } from "../common/http-metrics";
import { MetricsController } from "./metrics.controller";

const token = "metrics-token-with-at-least-thirty-two-bytes";
const controller = (configured = true) =>
  new MetricsController({
    get: vi.fn().mockReturnValue(configured ? token : undefined),
  } as never);

describe("MetricsController", () => {
  it.each([undefined, "Bearer wrong", token])(
    "conceals the endpoint for invalid authorization %s",
    (authorization) => {
      expect(() => controller().scrape(authorization, {} as never)).toThrow(
        NotFoundException,
      );
    },
  );

  it("returns Prometheus text only for the exact bearer credential", () => {
    httpMetrics.reset();
    httpMetrics.observe("GET", "/v1/health/ready", 200, 0.01);
    const send = vi.fn();
    const type = vi.fn().mockReturnValue({ send });
    controller().scrape(`Bearer ${token}`, { type } as never);
    expect(type).toHaveBeenCalledWith(
      "text/plain; version=0.0.4; charset=utf-8",
    );
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining("amanor_http_request_duration_seconds"),
    );
  });

  it("fails closed when no scrape credential is configured", () => {
    expect(() =>
      controller(false).scrape(`Bearer ${token}`, {} as never),
    ).toThrow(NotFoundException);
  });
});
