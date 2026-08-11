import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";
import type { Connection } from "mongoose";

describe("HealthController", () => {
  it("exposes non-sensitive liveness and readiness payloads", () => {
    const controller = new HealthController();
    expect(controller.live()).toEqual(
      expect.objectContaining({ status: "ok", service: "amanor-api" }),
    );
    expect(controller.ready()).not.toHaveProperty("environment");
    expect(controller.ready()).not.toHaveProperty("database");
  });

  it("fails readiness without exposing dependency details when MongoDB is disconnected", () => {
    const controller = new HealthController({ readyState: 0 } as Connection);
    expect(() => controller.ready()).toThrow(/dependencies are not ready/i);
  });
});
