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

type Job = {
  _id: ObjectId;
  reference: string;
  name: string;
  outlet: string;
  email: string;
  subject: string;
  message: string;
  deadline?: Date;
  attempts: number;
};
@Injectable()
export class MediaEnquiryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private draining = false;
  private readonly logger = new Logger(MediaEnquiryWorker.name);
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}
  onApplicationBootstrap(): void {
    if (
      !this.config.get("RESEND_API_KEY") ||
      !this.config.get("EMAIL_FROM") ||
      !this.config.get("PRESS_CONTACT_EMAIL")
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
      for (let count = 0; count < 10; count += 1) {
        const now = new Date();
        const staleLock = new Date(now.getTime() - 60_000);
        const job = await this.connection.db
          .collection<Job>("media_enquiries")
          .findOneAndUpdate(
            {
              $or: [
                {
                  status: { $in: ["pending", "failed"] },
                  availableAt: { $lte: now },
                },
                { status: "processing", lockedAt: { $lte: staleLock } },
              ],
            },
            {
              $set: { status: "processing", lockedAt: now },
              $inc: { attempts: 1 },
            },
            { sort: { availableAt: 1 }, returnDocument: "after" },
          );
        if (!job) break;
        await this.deliver(job);
      }
    } finally {
      this.draining = false;
    }
  }
  private async deliver(job: Job): Promise<void> {
    if (!this.connection.db) return;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": job.reference,
        },
        body: JSON.stringify({
          from: this.config.getOrThrow<string>("EMAIL_FROM"),
          to: [this.config.getOrThrow<string>("PRESS_CONTACT_EMAIL")],
          reply_to: job.email,
          subject: `[${job.reference}] ${job.subject}`,
          text: `Media enquiry from ${job.name}, ${job.outlet}\nDeadline: ${job.deadline?.toISOString() ?? "not supplied"}\n\n${job.message}`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`Resend returned HTTP ${response.status}`);
      await this.connection.db.collection("media_enquiries").updateOne(
        { _id: job._id },
        {
          $set: { status: "delivered", deliveredAt: new Date() },
          $unset: { lockedAt: "", lastError: "" },
        },
      );
    } catch (error) {
      const delay = Math.min(
        3_600_000,
        2 ** Math.min(job.attempts, 10) * 1_000,
      );
      await this.connection.db.collection("media_enquiries").updateOne(
        { _id: job._id },
        {
          $set: {
            status: "failed",
            availableAt: new Date(Date.now() + delay),
            lastError:
              error instanceof Error
                ? error.message.slice(0, 200)
                : "Delivery failed",
          },
          $unset: { lockedAt: "" },
        },
      );
      const message = `Media enquiry delivery failed for ${job.reference}`;
      if (job.attempts >= 2) this.logger.error(`${message}; alert required`);
      else this.logger.warn(message);
    }
  }
}
