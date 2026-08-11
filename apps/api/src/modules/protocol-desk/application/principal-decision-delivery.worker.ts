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
import type { AuthUser } from "../../auth/persistence/auth.repository";
import type { EngagementRequest } from "../domain/engagement-request";
import type { PrincipalDecisionDelivery } from "../domain/principal-decision-delivery";
import { ProtocolDeskRepository } from "../persistence/protocol-desk.repository";
import { ProtocolNoteService } from "./protocol-note.service";

type ClaimedDelivery = PrincipalDecisionDelivery & { _id: ObjectId };

@Injectable()
export class PrincipalDecisionDeliveryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private draining = false;
  private readonly logger = new Logger(PrincipalDecisionDeliveryWorker.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ProtocolDeskRepository)
    private readonly repository: ProtocolDeskRepository,
    @Inject(ProtocolNoteService)
    private readonly protocolNote: ProtocolNoteService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled()) return;
    void this.drain();
    this.timer = setInterval(() => void this.drain(), 5_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drain(): Promise<void> {
    if (this.draining || !this.connection.db || !this.enabled()) return;
    this.draining = true;
    try {
      for (let count = 0; count < 10; count += 1) {
        const delivery = await this.claim();
        if (!delivery) break;
        await this.deliver(delivery);
      }
    } finally {
      this.draining = false;
    }
  }

  private enabled(): boolean {
    return Boolean(
      this.config.get("RESEND_API_KEY") &&
      this.config.get("EMAIL_FROM") &&
      this.config.get("PROTOCOL_DECISION_DERIVATION_KEY"),
    );
  }

  private async claim(): Promise<ClaimedDelivery | null> {
    const now = new Date();
    return this.deliveries().findOneAndUpdate(
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

  private async deliver(delivery: ClaimedDelivery): Promise<void> {
    try {
      const request = await this.requests().findOne({
        requestId: delivery.requestId,
      });
      if (!request) throw new Error("Protocol Desk request is unavailable");
      if (!["awaiting_decision", "held"].includes(request.state)) {
        await this.deliveries().updateOne(
          { _id: delivery._id },
          {
            $set: { status: "cancelled" },
            $unset: { lockedAt: "", lastError: "" },
          },
        );
        return;
      }
      const principals = await this.users()
        .find({
          roles: "principal",
          disabledAt: { $exists: false },
          invitationAcceptedAt: { $exists: true },
        })
        .limit(2)
        .toArray();
      if (principals.length !== 1)
        throw new Error("Exactly one active Principal mailbox is required");
      const principal = principals[0]!;
      const tokens = await this.repository.capabilitiesForPrincipalDelivery(
        request.requestId,
        delivery.deliveryId,
        principal.userId,
        this.config.getOrThrow<string>("PROTOCOL_DECISION_DERIVATION_KEY"),
      );
      const note = await this.protocolNote.generateStored(
        request.requestId,
        undefined,
        delivery.createdAt,
      );
      const message = principalDecisionMessage({
        locale: request.locale,
        reference: request.reference,
        eventName: request.engagement.eventName,
        publicOrigin: this.config.getOrThrow<string>("PUBLIC_WEB_ORIGIN"),
        tokens,
      });
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": delivery.deliveryId,
        },
        body: JSON.stringify({
          from: this.config.getOrThrow<string>("EMAIL_FROM"),
          to: [principal.emailCanonical],
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: [
            {
              filename: note.filename,
              content: note.body.toString("base64"),
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`Resend returned HTTP ${response.status}`);
      const provider = (await response.json().catch(() => ({}))) as {
        id?: string;
      };
      await this.deliveries().updateOne(
        { _id: delivery._id },
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
      await this.deliveries().updateOne(
        { _id: delivery._id },
        {
          $set: {
            status: "failed",
            availableAt: new Date(
              Date.now() +
                Math.min(
                  3_600_000,
                  2 ** Math.min(delivery.attempts, 10) * 1_000,
                ),
            ),
            lastError: safeError,
          },
          $unset: { lockedAt: "" },
        },
      );
      const message = `Principal decision delivery failed for ${delivery.deliveryId}`;
      if (delivery.attempts >= 2)
        this.logger.error(`${message}; alert required`);
      else this.logger.warn(message);
    }
  }

  private deliveries(): Collection<PrincipalDecisionDelivery> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection(
      "protocol_principal_decision_deliveries",
    );
  }

  private requests(): Collection<EngagementRequest> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection("protocol_requests");
  }

  private users(): Collection<AuthUser> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    return this.connection.db.collection("users");
  }
}

export function principalDecisionMessage(
  input: Readonly<{
    locale: "en-GB" | "fr-FR";
    reference: string;
    eventName: string;
    publicOrigin: string;
    tokens: Readonly<
      Partial<
        Record<"accept" | "decline" | "hold" | "request_information", string>
      >
    >;
  }>,
): Readonly<{ subject: string; text: string; html: string }> {
  const french = input.locale === "fr-FR";
  const labels = french
    ? {
        accept: "Accepter",
        decline: "Refuser",
        hold: "Mettre en attente",
        request_information: "Demander des informations",
      }
    : {
        accept: "Accept",
        decline: "Decline",
        hold: "Place on hold",
        request_information: "Request information",
      };
  const base = input.publicOrigin.replace(/\/$/u, "");
  const path = french ? "/fr/protocol-decision" : "/protocol-decision";
  const links = Object.entries(input.tokens).map(([action, token]) => ({
    action: action as keyof typeof labels,
    label: labels[action as keyof typeof labels],
    url: `${base}${path}#token=${encodeURIComponent(token)}&action=${action}`,
  }));
  if (links.length === 0)
    throw new Error("No Principal decision links are available");
  const subject = french
    ? `Décision requise · ${input.reference}`
    : `Decision required · ${input.reference}`;
  const introduction = french
    ? `La note de protocole pour « ${input.eventName} » est jointe. Chaque lien est personnel, expire après 48 heures et ne peut être utilisé qu’une seule fois.`
    : `The Protocol Note for “${input.eventName}” is attached. Each link is personal, expires after 48 hours, and can be used only once.`;
  const text = `${subject}\n\n${introduction}\n\n${links
    .map((link) => `${link.label}: ${link.url}`)
    .join("\n")}\n`;
  const html = `<h1>${escapeHtml(subject)}</h1><p>${escapeHtml(introduction)}</p><ul>${links
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.url)}" rel="noreferrer">${escapeHtml(link.label)}</a></li>`,
    )
    .join("")}</ul>`;
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}
