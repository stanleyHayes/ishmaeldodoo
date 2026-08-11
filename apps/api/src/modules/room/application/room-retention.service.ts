import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { httpMetrics } from "../../../common/http-metrics";
import { RoomEnquiryRepository } from "../persistence/room-enquiry.repository";
import { RoomAuditService } from "./room-audit.service";
import { RoomConfigService } from "./room-config";

export type RoomDeletionOutcome = Readonly<{
  scanned: number;
  deleted: number;
  failed: number;
}>;

const SCAN_INTERVAL_MILLISECONDS = 60 * 60 * 1_000;
const SCAN_BATCH = 100;

/**
 * Deletes expired Room submissions and records content-free evidence that it
 * happened.
 *
 * A TTL index would have been less code and would have been wrong: TTL expiry
 * deletes silently, and the threat model requires deletion evidence and requires
 * that a failed deletion alerts rather than disappears. This worker therefore
 * deletes explicitly, writes a `room_enquiry_deleted` event per item, and marks
 * failures for retry so they surface as a non-zero aggregate instead of being
 * lost.
 *
 * Nothing here reads ciphertext, and no log line carries a reference.
 */
@Injectable()
export class RoomRetentionService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(RoomRetentionService.name);

  constructor(
    @Inject(RoomEnquiryRepository)
    private readonly repository: RoomEnquiryRepository,
    @Inject(RoomAuditService) private readonly audit: RoomAuditService,
    @Inject(RoomConfigService)
    private readonly configuration: RoomConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.configuration.enabled) return;
    this.timer = setInterval(() => {
      void this.drain().catch(() => {
        // Aggregate-only: a scan fault must never surface a reference.
        this.logger.error("Room retention scan failed");
      });
    }, SCAN_INTERVAL_MILLISECONDS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drain(now = new Date()): Promise<RoomDeletionOutcome> {
    if (this.running) return { scanned: 0, deleted: 0, failed: 0 };
    this.running = true;
    try {
      const expired = await this.repository.findExpired(now, SCAN_BATCH);
      let deleted = 0;
      let failed = 0;

      for (const record of expired) {
        try {
          const removed = await this.repository.deleteEnquiry(
            record.reference,
            now,
          );
          if (!removed) {
            failed += 1;
            continue;
          }
          // Written after the ciphertext is gone, so evidence can never claim a
          // deletion that did not happen.
          await this.audit.record(
            {
              action: "room_enquiry_deleted",
              reference: record.reference,
              keyId: record.recipientKeyId,
            },
            now,
          );
          deleted += 1;
        } catch {
          failed += 1;
          await this.repository.recordDeletionFailure(record.reference);
          await this.audit.recordQuietly(
            { action: "room_deletion_failed", reference: record.reference },
            now,
          );
        }
      }

      if (failed > 0) {
        this.logger.error(
          `Room retention deletion failed for ${failed} of ${expired.length} due items`,
        );
      }
      const health = await this.repository.retentionHealth(now);
      httpMetrics.setGauge("amanor_room_retention_due", health.due);
      httpMetrics.setGauge("amanor_room_retention_failed", health.failed);
      httpMetrics.setGauge(
        "amanor_room_retention_oldest_overdue_seconds",
        health.oldestOverdueSeconds,
      );
      httpMetrics.setGauge("amanor_room_retention_scan_healthy", 1);
      httpMetrics.setGauge(
        "amanor_room_retention_last_success_timestamp_seconds",
        Math.floor(now.getTime() / 1_000),
      );
      return { scanned: expired.length, deleted, failed };
    } catch (error) {
      httpMetrics.setGauge("amanor_room_retention_scan_healthy", 0);
      throw error;
    } finally {
      this.running = false;
    }
  }
}
