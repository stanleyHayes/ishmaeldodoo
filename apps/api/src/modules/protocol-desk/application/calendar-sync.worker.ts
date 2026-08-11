import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import type { Collection, ObjectId } from "mongodb";
import type { Connection } from "mongoose";
import type { EngagementRequest } from "../domain/engagement-request";
import {
  calendarEventPayload,
  calendarPayloadHash,
  type CalendarSyncJob,
} from "../domain/calendar-sync";

type ClaimedCalendarJob = CalendarSyncJob & { _id: ObjectId };

@Injectable()
export class CalendarSyncWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CalendarSyncWorker.name);
  private timer?: NodeJS.Timeout;
  private draining = false;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.configured()) return;
    void this.drain();
    this.timer = setInterval(() => void this.drain(), 5_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drain(): Promise<void> {
    if (this.draining || !this.connection.db || !this.configured()) return;
    this.draining = true;
    try {
      for (let count = 0; count < 10; count += 1) {
        const job = await this.claim();
        if (!job) break;
        await this.deliver(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private configured(): boolean {
    return Boolean(
      this.config.get("CALENDAR_API_URL") &&
      this.config.get("CALENDAR_API_TOKEN") &&
      this.config.get("CALENDAR_ID"),
    );
  }

  private collection(): Collection<CalendarSyncJob> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection<CalendarSyncJob>("calendar_sync_jobs");
  }

  private async claim(): Promise<ClaimedCalendarJob | null> {
    const now = new Date();
    return this.collection().findOneAndUpdate(
      {
        $or: [
          {
            status: { $in: ["pending", "failed"] },
            availableAt: { $lte: now },
          },
          {
            status: "processing",
            lockedAt: { $lte: new Date(now.getTime() - 60_000) },
          },
        ],
      },
      { $set: { status: "processing", lockedAt: now }, $inc: { attempts: 1 } },
      { sort: { availableAt: 1 }, returnDocument: "after" },
    );
  }

  private async deliver(job: ClaimedCalendarJob): Promise<void> {
    try {
      if (!this.connection.db) throw new Error("MongoDB is not connected");
      const request = await this.connection.db
        .collection<EngagementRequest>("protocol_requests")
        .findOne({ requestId: job.requestId });
      if (!request) throw new Error("Protocol Desk request is unavailable");
      if (!["accepted", "contracted", "delivered"].includes(request.state))
        throw new Error("Protocol Desk request is not calendar-eligible");

      const payload = calendarEventPayload(
        request,
        this.config.getOrThrow<string>("CALENDAR_ID"),
      );
      const response = await fetch(
        this.config.getOrThrow<string>("CALENDAR_API_URL"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.getOrThrow<string>("CALENDAR_API_TOKEN")}`,
            "Content-Type": "application/json",
            "Idempotency-Key": payload.idempotencyKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok && response.status !== 409)
        throw new Error(`Calendar adapter returned HTTP ${response.status}`);
      const provider = (await response.json().catch(() => ({}))) as {
        eventId?: unknown;
      };
      await this.collection().updateOne(
        { _id: job._id, status: "processing" },
        {
          $set: {
            status: "completed",
            completedAt: new Date(),
            payloadHash: calendarPayloadHash(payload),
            ...(typeof provider.eventId === "string" && provider.eventId
              ? { providerEventId: provider.eventId.slice(0, 200) }
              : {}),
          },
          $unset: { lockedAt: "", lastError: "" },
        },
      );
    } catch (error) {
      await this.collection().updateOne(
        { _id: job._id, status: "processing" },
        {
          $set: {
            status: "failed",
            availableAt: new Date(
              Date.now() +
                Math.min(3_600_000, 2 ** Math.min(job.attempts, 10) * 1_000),
            ),
            lastError:
              error instanceof Error
                ? error.message.slice(0, 200)
                : "Calendar synchronization failed",
          },
          $unset: { lockedAt: "" },
        },
      );
      const message = `Calendar synchronization failed for ${job.requestId}`;
      if (job.attempts >= 2) this.logger.error(`${message}; alert required`);
      else this.logger.warn(message);
    }
  }
}
