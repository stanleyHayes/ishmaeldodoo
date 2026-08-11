import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import type { ObjectId } from "mongodb";
import type { Connection } from "mongoose";

type ContactJob = {
  _id: ObjectId;
  reference: string;
  name: string;
  email: string;
  organisation?: string;
  category: string;
  subject: string;
  message: string;
  locale: "en-GB" | "fr-FR";
  attempts: number;
};

@Injectable()
export class ContactEnquiryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private draining = false;
  private readonly logger = new Logger(ContactEnquiryWorker.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (
      !this.config.get("RESEND_API_KEY") ||
      !this.config.get("EMAIL_FROM") ||
      !this.config.get("GENERAL_CONTACT_EMAIL")
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
          .collection<ContactJob>("contact_enquiries")
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

  private async deliver(job: ContactJob): Promise<void> {
    if (!this.connection.db) return;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": job.reference,
        },
        body: JSON.stringify({
          from: this.config.getOrThrow<string>("EMAIL_FROM"),
          to: [this.config.getOrThrow<string>("GENERAL_CONTACT_EMAIL")],
          reply_to: job.email,
          subject: `[${job.reference}] [${job.category}] ${job.subject}`,
          text: [
            `General contact enquiry from ${job.name}`,
            `Organisation: ${job.organisation ?? "not supplied"}`,
            `Locale: ${job.locale}`,
            "",
            job.message,
          ].join("\n"),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`Resend returned HTTP ${response.status}`);
      await this.connection.db.collection("contact_enquiries").updateOne(
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
      await this.connection.db.collection("contact_enquiries").updateOne(
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
      const message = `Contact delivery failed for ${job.reference}`;
      if (job.attempts >= 2) this.logger.error(`${message}; alert required`);
      else this.logger.warn(message);
    }
  }
}
