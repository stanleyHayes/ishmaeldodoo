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

type AuthNotificationJob = Readonly<{
  _id: ObjectId;
  notificationId: string;
  emailCanonical: string;
  type: "account_recovered" | "recovery_codes_rotated";
  occurredAt: Date;
  attempts: number;
}>;

const messages = {
  account_recovered: {
    subject: "Project AMANOR account recovery notice",
    text: (occurredAt: string) =>
      [
        `A single-use recovery code was used for your Project AMANOR administrator account at ${occurredAt}.`,
        "Every older session was revoked. If this was not you, contact the designated Security Administrator immediately.",
        "",
        `Un code de récupération à usage unique a été utilisé pour votre compte administrateur Project AMANOR à ${occurredAt}.`,
        "Toutes les anciennes sessions ont été révoquées. Si vous n'êtes pas à l'origine de cette action, contactez immédiatement l'administrateur de sécurité désigné.",
      ].join("\n"),
  },
  recovery_codes_rotated: {
    subject: "Project AMANOR recovery codes changed",
    text: (occurredAt: string) =>
      [
        `Your Project AMANOR administrator recovery codes were replaced at ${occurredAt}. Every prior recovery code is now invalid.`,
        "If this was not you, contact the designated Security Administrator immediately.",
        "",
        `Les codes de récupération de votre compte administrateur Project AMANOR ont été remplacés à ${occurredAt}. Tous les anciens codes sont désormais invalides.`,
        "Si vous n'êtes pas à l'origine de cette action, contactez immédiatement l'administrateur de sécurité désigné.",
      ].join("\n"),
  },
} as const;

@Injectable()
export class AuthNotificationWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private draining = false;
  private readonly logger = new Logger(AuthNotificationWorker.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService) private readonly configuration: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (
      !this.configuration.get("RESEND_API_KEY") ||
      !this.configuration.get("EMAIL_FROM")
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
        const job = await this.connection.db
          .collection<AuthNotificationJob>("auth_notification_jobs")
          .findOneAndUpdate(
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

  private async deliver(job: AuthNotificationJob): Promise<void> {
    if (!this.connection.db) return;
    try {
      const message = messages[job.type];
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.configuration.getOrThrow<string>("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": job.notificationId,
        },
        body: JSON.stringify({
          from: this.configuration.getOrThrow<string>("EMAIL_FROM"),
          to: [job.emailCanonical],
          subject: message.subject,
          text: message.text(job.occurredAt.toISOString()),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`Email provider returned HTTP ${response.status}`);
      await this.connection.db.collection("auth_notification_jobs").updateOne(
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
      await this.connection.db.collection("auth_notification_jobs").updateOne(
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
      const summary = `Authentication notification delivery failed for ${job.notificationId}`;
      if (job.attempts >= 2) this.logger.error(`${summary}; alert required`);
      else this.logger.warn(summary);
    }
  }
}
