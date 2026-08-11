import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { resolveDateRangedRecord } from "@amanor/contracts";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import type { Collection, ObjectId } from "mongodb";
import type { Connection } from "mongoose";
import {
  emailTemplateSchema,
  identitySchema,
} from "../../content/domain/schemas";
import type { LocalizedText, Locale } from "../../content/domain/types";
import type { Publication } from "../../content/domain/workflow";
import type { ContentKind } from "../../content/domain/types";
import type { ContentVersion } from "../../content/domain/workflow";
import type { EngagementRequest } from "../domain/engagement-request";
import {
  renderCorrespondenceTemplate,
  shouldCancelScheduledJob,
  type CorrespondenceJob,
} from "../domain/correspondence";
import { ProtocolNoteService } from "./protocol-note.service";

type ClaimedJob = CorrespondenceJob & { _id: ObjectId };

@Injectable()
export class CorrespondenceWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private draining = false;
  private readonly logger = new Logger(CorrespondenceWorker.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ProtocolNoteService)
    private readonly protocolNote: ProtocolNoteService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get("RESEND_API_KEY") || !this.config.get("EMAIL_FROM"))
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
        const job = await this.claim();
        if (!job) break;
        await this.deliver(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private async claim(): Promise<ClaimedJob | null> {
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

  private async deliver(job: ClaimedJob): Promise<void> {
    try {
      const request = await this.requests().findOne({
        requestId: job.requestId,
      });
      if (!request) throw new Error("Protocol Desk request is unavailable");
      if (shouldCancelScheduledJob(job.template, request.state)) {
        await this.collection().updateOne(
          { _id: job._id },
          {
            $set: { status: "cancelled" },
            $unset: { lockedAt: "", lastError: "" },
          },
        );
        return;
      }
      const [template, identity] = await Promise.all([
        this.template(job.template, job.locale),
        this.identity(job.locale),
      ]);
      const rendered = renderCorrespondenceTemplate(template, {
        reference: request.reference,
        requesterName: request.requester.name,
        organisationName: request.organisation.name,
        eventName: request.engagement.eventName,
        eventDate: new Intl.DateTimeFormat(job.locale, {
          dateStyle: "long",
        }).format(request.engagement.startsAt),
        principalName: identity.legalName,
        principalShortName: identity.shortName,
        principalTitle: identity.currentTitle,
        reason: await this.latestReason(request.requestId),
        responseWindow:
          job.locale === "fr-FR" ? "quarante-huit heures" : "forty-eight hours",
      });
      const protocolNote =
        job.template === "acceptance"
          ? await this.protocolNote.generateStored(job.requestId)
          : undefined;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": job.correspondenceId,
        },
        body: JSON.stringify({
          from: this.config.getOrThrow<string>("EMAIL_FROM"),
          to: [job.recipient],
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          ...(protocolNote
            ? {
                attachments: [
                  {
                    filename: protocolNote.filename,
                    content: protocolNote.body.toString("base64"),
                  },
                ],
              }
            : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`Resend returned HTTP ${response.status}`);
      const provider = (await response.json().catch(() => ({}))) as {
        id?: string;
      };
      await this.collection().updateOne(
        { _id: job._id },
        {
          $set: {
            status: "delivered",
            deliveredAt: new Date(),
            ...(provider.id ? { providerMessageId: provider.id } : {}),
          },
          $unset: { lockedAt: "", lastError: "" },
        },
      );
    } catch (error) {
      const safeError =
        error instanceof Error
          ? error.message.slice(0, 200)
          : "Delivery failed";
      await this.collection().updateOne(
        { _id: job._id },
        {
          $set: {
            status: "failed",
            availableAt: new Date(
              Date.now() +
                Math.min(3_600_000, 2 ** Math.min(job.attempts, 10) * 1_000),
            ),
            lastError: safeError,
          },
          $unset: { lockedAt: "" },
        },
      );
      const message = `Correspondence delivery failed for ${job.correspondenceId}`;
      if (job.attempts >= 2) this.logger.error(`${message}; alert required`);
      else this.logger.warn(message);
    }
  }

  private async template(
    key: string,
    locale: Locale,
  ): Promise<
    Readonly<{
      subject: string;
      bodyText: string;
      bodyHtml: string;
      allowedVariables: readonly string[];
    }>
  > {
    const payload = emailTemplateSchema.parse(
      await this.publishedPayload("emailTemplate", locale, {
        "payload.key": key,
      }),
    );
    for (const field of [payload.subject, payload.bodyText, payload.bodyHtml])
      this.assertLocaleCurrent(field, locale);
    return {
      subject: payload.subject[locale],
      bodyText: payload.bodyText[locale],
      bodyHtml: payload.bodyHtml[locale],
      allowedVariables: payload.allowedVariables,
    };
  }

  private async identity(
    locale: Locale,
  ): Promise<
    Readonly<{ legalName: string; shortName: string; currentTitle: string }>
  > {
    const payload = identitySchema.parse(
      await this.publishedPayload("identity", locale, {
        "payload.singletonKey": "canonical",
      }),
    );
    const title = resolveDateRangedRecord(payload.titleHistory);
    if (!title) throw new Error("Published identity has no current title");
    this.assertLocaleCurrent(title.title, locale);
    return {
      legalName: payload.legalName,
      shortName: payload.shortName,
      currentTitle: title.title[locale],
    };
  }

  private async publishedPayload(
    documentType: ContentKind,
    locale: Locale,
    versionFilter: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    const publications = await this.connection.db
      .collection<Publication>("publications")
      .find({ documentType, locale })
      .toArray();
    if (!publications.length)
      throw new Error(`Published ${documentType} content is unavailable`);
    const row = await this.connection.db
      .collection<ContentVersion>("content_versions")
      .findOne({
        documentType,
        state: "published",
        $or: publications.map((item) => ({
          documentId: item.documentId,
          version: item.version,
        })),
        ...versionFilter,
      });
    if (!row)
      throw new Error(`Published ${documentType} content is unavailable`);
    return row.payload;
  }

  private assertLocaleCurrent(field: LocalizedText, locale: Locale): void {
    if (!field[locale] || field.status[locale] !== "current")
      throw new Error(`Published correspondence is not current for ${locale}`);
  }

  private async latestReason(requestId: string): Promise<string> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    const event = await this.connection.db
      .collection<{
        requestId: string;
        reason: string;
        occurredAt: Date;
      }>("protocol_request_events")
      .findOne({ requestId }, { sort: { occurredAt: -1 } });
    return event?.reason ?? "";
  }

  private collection(): Collection<CorrespondenceJob> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection<CorrespondenceJob>("correspondence");
  }

  private requests(): Collection<EngagementRequest> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection<EngagementRequest>(
      "protocol_requests",
    );
  }
}
