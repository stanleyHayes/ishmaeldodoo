import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import type { ObjectId } from "mongodb";
import { revalidationRequestSchema } from "@amanor/contracts";
import { signRevalidationRequest } from "./revalidation-signature";

type OutboxJob = Readonly<{
  _id: ObjectId;
  idempotencyKey: string;
  tags: readonly string[];
  attempts?: number;
}>;

@Injectable()
export class RevalidationOutboxService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RevalidationOutboxService.name);
  private timer?: NodeJS.Timeout;
  private draining = false;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService) private readonly configuration: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (
      !this.configuration.get<string>("WEB_REVALIDATION_URL") ||
      !this.configuration.get<string>("REVALIDATION_WEBHOOK_KEYS") ||
      !this.configuration.get<string>("REVALIDATION_ACTIVE_KEY_ID")
    )
      return;
    void this.drain();
    this.timer = setInterval(() => void this.drain(), 5_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drain(): Promise<void> {
    if (this.draining || !this.connection.db) return;
    this.draining = true;
    try {
      for (let processed = 0; processed < 20; processed += 1) {
        const now = new Date();
        const abandonedBefore = new Date(now.getTime() - 60_000);
        const claimed = await this.connection.db
          .collection<OutboxJob>("outbox_jobs")
          .findOneAndUpdate(
            {
              $or: [
                {
                  status: { $in: ["pending", "failed"] },
                  availableAt: { $lte: now },
                },
                { status: "processing", lockedAt: { $lte: abandonedBefore } },
              ],
            },
            {
              $set: { status: "processing", lockedAt: now },
              $inc: { attempts: 1 },
            },
            { sort: { availableAt: 1 }, returnDocument: "after" },
          );
        if (!claimed) break;
        await this.deliver(claimed);
      }
    } finally {
      this.draining = false;
    }
  }

  private async deliver(job: OutboxJob): Promise<void> {
    if (!this.connection.db) return;
    try {
      const url = this.configuration.getOrThrow<string>("WEB_REVALIDATION_URL");
      const keyId = this.configuration.getOrThrow<string>(
        "REVALIDATION_ACTIVE_KEY_ID",
      );
      const audience =
        this.configuration.get<string>("REVALIDATION_AUDIENCE") ??
        "amanor-public-web";
      const keys = JSON.parse(
        this.configuration.getOrThrow<string>("REVALIDATION_WEBHOOK_KEYS"),
      ) as Record<string, string>;
      const secret = keys[keyId];
      if (!secret) throw new Error("Active revalidation key is unavailable");
      const request = revalidationRequestSchema.parse({
        idempotencyKey: job.idempotencyKey,
        tags: job.tags,
      });
      const rawBody = JSON.stringify(request);
      const timestamp = Date.now().toString();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Amanor-Timestamp": timestamp,
          "X-Amanor-Key-Id": keyId,
          "X-Amanor-Audience": audience,
          "X-Amanor-Signature": signRevalidationRequest(
            keyId,
            audience,
            timestamp,
            rawBody,
            secret,
          ),
        },
        body: rawBody,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok && response.status !== 409)
        throw new Error(`Revalidation returned HTTP ${response.status}`);
      await this.connection.db.collection("outbox_jobs").updateOne(
        { _id: job._id, status: "processing" },
        {
          $set: { status: "completed", completedAt: new Date() },
          $unset: { lockedAt: "", lastError: "" },
        },
      );
    } catch (error) {
      const attempts = job.attempts ?? 1;
      const delay = Math.min(
        60 * 60 * 1_000,
        2 ** Math.min(attempts, 10) * 1_000,
      );
      await this.connection.db.collection("outbox_jobs").updateOne(
        { _id: job._id, status: "processing" },
        {
          $set: {
            status: "failed",
            availableAt: new Date(Date.now() + delay),
            lastError:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Delivery failed",
          },
          $unset: { lockedAt: "" },
        },
      );
      const message = `Revalidation delivery failed for ${job.idempotencyKey}`;
      if ((job.attempts ?? 1) >= 2)
        this.logger.error(`${message}; alert required`);
      else this.logger.warn(message);
    }
  }
}
