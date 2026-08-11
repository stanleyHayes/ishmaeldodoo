import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { httpMetrics } from "../../common/http-metrics";

const scanIntervalMilliseconds = 5 * 60 * 1_000;
const monitoredCollections = [
  ["contact_enquiries", "general_contact"],
  ["media_enquiries", "media_enquiry"],
  ["press_kit_requests", "press_kit"],
  ["living_dossier_requests", "living_dossier"],
] as const;

export type TtlRetentionSnapshot = Readonly<{
  due: Readonly<Record<(typeof monitoredCollections)[number][1], number>>;
  oldestOverdueSeconds: Readonly<
    Record<(typeof monitoredCollections)[number][1], number>
  >;
}>;

/**
 * MongoDB's TTL monitor is asynchronous. This service does not duplicate or
 * race deletion; it makes overdue personal-data records visible as fixed,
 * aggregate metrics so an unhealthy TTL path cannot fail silently.
 */
@Injectable()
export class TtlRetentionMonitorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(TtlRetentionMonitorService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  onApplicationBootstrap(): void {
    void this.scan().catch(() => {
      this.logger.error("Personal-data TTL retention scan failed");
    });
    this.timer = setInterval(() => {
      void this.scan().catch(() => {
        this.logger.error("Personal-data TTL retention scan failed");
      });
    }, scanIntervalMilliseconds);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async scan(now = new Date()): Promise<TtlRetentionSnapshot> {
    if (this.running)
      return {
        due: this.emptySnapshot(),
        oldestOverdueSeconds: this.emptySnapshot(),
      };
    this.running = true;
    try {
      if (!this.connection.db) throw new Error("MongoDB is not connected");
      const due = this.emptySnapshot();
      const oldestOverdueSeconds = this.emptySnapshot();
      for (const [collectionName, recordClass] of monitoredCollections) {
        const collection = this.connection.db.collection(collectionName);
        const filter = { expiresAt: { $lte: now } };
        const [count, oldest] = await Promise.all([
          collection.countDocuments(filter),
          collection.findOne<{ expiresAt: Date }>(filter, {
            sort: { expiresAt: 1 },
            projection: { _id: 0, expiresAt: 1 },
          }),
        ]);
        due[recordClass] = count;
        oldestOverdueSeconds[recordClass] = oldest
          ? Math.max(0, (now.getTime() - oldest.expiresAt.getTime()) / 1_000)
          : 0;
        httpMetrics.setGauge("amanor_personal_data_retention_due", count, {
          record_class: recordClass,
        });
        httpMetrics.setGauge(
          "amanor_personal_data_retention_oldest_overdue_seconds",
          oldestOverdueSeconds[recordClass],
          { record_class: recordClass },
        );
      }
      httpMetrics.setGauge("amanor_personal_data_retention_scan_healthy", 1);
      httpMetrics.setGauge(
        "amanor_personal_data_retention_last_success_timestamp_seconds",
        Math.floor(now.getTime() / 1_000),
      );
      return { due, oldestOverdueSeconds };
    } catch (error) {
      httpMetrics.setGauge("amanor_personal_data_retention_scan_healthy", 0);
      throw error;
    } finally {
      this.running = false;
    }
  }

  private emptySnapshot(): Record<
    (typeof monitoredCollections)[number][1],
    number
  > {
    return {
      general_contact: 0,
      media_enquiry: 0,
      press_kit: 0,
      living_dossier: 0,
    };
  }
}
