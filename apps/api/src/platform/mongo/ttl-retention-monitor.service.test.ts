import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpMetrics } from "../../common/http-metrics";
import { TtlRetentionMonitorService } from "./ttl-retention-monitor.service";

describe("TTL retention monitor", () => {
  beforeEach(() => httpMetrics.reset());

  it("publishes only fixed-class aggregate overdue state", async () => {
    const collection = vi.fn((name: string) => ({
      countDocuments: vi
        .fn()
        .mockResolvedValue(name === "contact_enquiries" ? 2 : 0),
      findOne: vi.fn().mockResolvedValue(
        name === "contact_enquiries"
          ? {
              expiresAt: new Date("2026-08-10T10:00:00.000Z"),
              email: "must-not-appear@example.test",
            }
          : null,
      ),
    }));
    const monitor = new TtlRetentionMonitorService({
      db: { collection },
    } as never);

    const result = await monitor.scan(new Date("2026-08-10T12:00:00.000Z"));

    expect(result.due).toEqual({
      general_contact: 2,
      media_enquiry: 0,
      press_kit: 0,
      living_dossier: 0,
    });
    expect(result.oldestOverdueSeconds.general_contact).toBe(7_200);
    const output = httpMetrics.render();
    expect(output).toContain(
      'amanor_personal_data_retention_due{record_class="general_contact"} 2',
    );
    expect(output).toContain(
      'amanor_personal_data_retention_oldest_overdue_seconds{record_class="general_contact"} 7200',
    );
    expect(output).toContain("amanor_personal_data_retention_scan_healthy 1");
    expect(output).not.toContain("must-not-appear@example.test");
    expect(collection).toHaveBeenCalledTimes(4);
  });

  it("marks a failed scan unhealthy without emitting record data", async () => {
    const monitor = new TtlRetentionMonitorService({
      db: {
        collection: () => ({
          countDocuments: vi.fn().mockRejectedValue(new Error("unavailable")),
          findOne: vi.fn().mockResolvedValue(null),
        }),
      },
    } as never);

    await expect(monitor.scan()).rejects.toThrow(/unavailable/u);
    expect(httpMetrics.render()).toContain(
      "amanor_personal_data_retention_scan_healthy 0",
    );
  });
});
