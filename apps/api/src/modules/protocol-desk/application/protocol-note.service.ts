import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { z } from "zod";
import {
  resolveDateRangedRecord,
  type ProtocolNoteInput,
} from "@amanor/contracts";
import { CmsService } from "../../content/application/cms.service";
import { projectPublicLocale } from "../../content/domain/public-projection";
import { riderTemplateSchema } from "../../content/domain/schemas";
import type {
  ContentVersion,
  Publication,
} from "../../content/domain/workflow";
import { MediaService } from "../../media/application/media.service";
import {
  BrowserPdfService,
  escapeHtml,
} from "../../press-kit/browser-pdf.service";
import type { Role } from "../../auth/domain/roles";
import { hasPermission } from "../../auth/domain/roles";
import type { EngagementRequest } from "../domain/engagement-request";
import { ProtocolDeskRepository } from "../persistence/protocol-desk.repository";

const identityProjectionSchema = z.object({
  legalName: z.string(),
  honorific: z.string(),
  shortName: z.string(),
  bio120: z.string(),
  portraits: z.array(z.string().uuid()).min(1),
  titleHistory: z.array(
    z.object({
      title: z.string(),
      organisation: z.string(),
      from: z.coerce.date(),
      to: z.coerce.date().nullable(),
    }),
  ),
});
const projectedRiderSchema = z.object({
  key: z.string(),
  name: z.string(),
  engagementType: z.string(),
  logistics: z.array(z.string()),
  technicalRequirements: z.array(z.string()),
  timing: z.array(z.string()),
  travelAndAccommodation: z.array(z.string()),
  recordingAndRepublication: z.array(z.string()),
  honorariumTerms: z.array(z.string()),
  protocolRequirements: z.array(z.string()),
  contactRequirements: z.array(z.string()),
  accessibilityRequirements: z.array(z.string()),
  versionLabel: z.string(),
});

export type GeneratedProtocolNote = Readonly<{
  body: Buffer<ArrayBufferLike>;
  filename: string;
}>;

@Injectable()
export class ProtocolNoteService {
  constructor(
    @Inject(ProtocolDeskRepository)
    private readonly repository: ProtocolDeskRepository,
    @Inject(CmsService)
    private readonly cms: CmsService,
    @Inject(MediaService)
    private readonly media: MediaService,
    @Inject(BrowserPdfService)
    private readonly browser: BrowserPdfService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async generate(
    requestId: string,
    input: ProtocolNoteInput,
    roles: readonly Role[],
    now = new Date(),
  ): Promise<GeneratedProtocolNote> {
    if (!hasPermission(roles, "desk:operate"))
      throw new BadRequestException("Protocol Desk operator role is required");
    const request = await this.repository.findRequest(requestId);
    if (!request)
      throw new NotFoundException("Protocol Desk request was not found");
    if (
      ![
        "awaiting_decision",
        "held",
        "accepted",
        "contracted",
        "delivered",
      ].includes(request.state)
    )
      throw new BadRequestException(
        "A Protocol Note is available only after configuration",
      );
    return this.generateForRequest(request, input, now);
  }

  async generateStored(
    requestId: string,
    roles?: readonly Role[],
    now = new Date(),
  ): Promise<GeneratedProtocolNote> {
    if (roles && !hasPermission(roles, "desk:operate"))
      throw new BadRequestException("Protocol Desk operator role is required");
    const request = await this.repository.findRequest(requestId);
    if (!request)
      throw new NotFoundException("Protocol Desk request was not found");
    if (
      ![
        "awaiting_decision",
        "held",
        "accepted",
        "contracted",
        "delivered",
      ].includes(request.state)
    )
      throw new BadRequestException(
        "A Protocol Note is available only after configuration",
      );
    if (!request.protocolNoteConfiguration)
      throw new BadRequestException(
        "Protocol Note configuration is unavailable",
      );
    return this.generateForRequest(
      request,
      request.protocolNoteConfiguration,
      now,
    );
  }

  private async generateForRequest(
    request: EngagementRequest,
    input: ProtocolNoteInput,
    now: Date,
  ): Promise<GeneratedProtocolNote> {
    const [identityResult, rider] = await Promise.all([
      this.cms.publicProjection("identity", "canonical", request.locale),
      this.rider(request),
    ]);
    const identity = identityProjectionSchema.safeParse(
      identityResult?.payload,
    );
    if (!identity.success)
      throw new NotFoundException("Approved canonical identity is unavailable");
    const currentTitle = resolveDateRangedRecord(
      identity.data.titleHistory,
      now,
    );
    if (!currentTitle)
      throw new NotFoundException("Approved current title is unavailable");
    const portraitId = identity.data.portraits[0];
    if (!portraitId)
      throw new NotFoundException("Approved portrait is unavailable");
    const portrait = await this.media.publicAsset(portraitId);
    if (!portrait || portrait.resourceType !== "image")
      throw new NotFoundException("Approved portrait is unavailable");
    const imageDataUri = await this.portraitDataUri(
      portrait.secureUrl,
      portrait.format,
    );
    const body = await this.browser.render(
      protocolNoteHtml({
        request,
        input,
        identity: identity.data,
        currentTitle,
        rider,
        portrait: {
          imageDataUri,
          credit: portrait.credit,
          licence: portrait.licence,
        },
        generatedAt: now,
      }),
    );
    return {
      body,
      filename: `protocol-note-${request.reference.toLowerCase()}-${request.locale}.pdf`,
    };
  }

  private async rider(
    request: EngagementRequest,
  ): Promise<z.infer<typeof projectedRiderSchema>> {
    if (!this.connection.db) throw new Error("MongoDB is not connected");
    const publications = await this.connection.db
      .collection<Publication>("publications")
      .find({ documentType: "riderTemplate", locale: request.locale })
      .toArray();
    if (!publications.length)
      throw new NotFoundException("Approved rider is unavailable");
    const mapping: Record<string, string> = {
      institutional_briefing: "briefing",
    };
    const engagementType =
      mapping[request.engagement.type] ?? request.engagement.type;
    const version = await this.connection.db
      .collection<ContentVersion>("content_versions")
      .findOne({
        documentType: "riderTemplate",
        state: "published",
        "payload.engagementType": engagementType,
        $or: publications.map((publication) => ({
          documentId: publication.documentId,
          version: publication.version,
        })),
      });
    const validated = riderTemplateSchema.safeParse(version?.payload);
    if (!validated.success)
      throw new NotFoundException("Approved rider is unavailable");
    return projectedRiderSchema.parse(
      projectPublicLocale(validated.data, request.locale),
    );
  }

  private async portraitDataUri(
    urlValue: string,
    format: string,
  ): Promise<string> {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || !url.hostname.endsWith("cloudinary.com"))
      throw new NotFoundException("Approved portrait is unavailable");
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok)
      throw new NotFoundException("Approved portrait is unavailable");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 5 * 1024 * 1024)
      throw new BadRequestException(
        "Approved portrait exceeds the print limit",
      );
    return `data:image/${escapeHtml(format)};base64,${bytes.toString("base64")}`;
  }
}

type ProtocolNoteView = Readonly<{
  request: EngagementRequest;
  input: ProtocolNoteInput;
  identity: z.infer<typeof identityProjectionSchema>;
  currentTitle: z.infer<
    typeof identityProjectionSchema
  >["titleHistory"][number];
  rider: z.infer<typeof projectedRiderSchema>;
  portrait: Readonly<{ imageDataUri: string; credit: string; licence: string }>;
  generatedAt: Date;
}>;

export function protocolNoteHtml(view: ProtocolNoteView): string {
  const { request, input, identity, currentTitle, rider, portrait } = view;
  const fr = request.locale === "fr-FR";
  const list = (items: readonly string[]): string =>
    `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  const technical = [
    ...rider.technicalRequirements,
    ...input.technicalRequirements,
  ];
  const logistics = [...rider.logistics, ...input.logistics];
  const accessibility = [
    ...rider.accessibilityRequirements,
    ...input.accessibilityRequirements,
  ];
  const yes = fr ? "Oui" : "Yes";
  const no = fr ? "Non" : "No";
  const travelLabel = {
    host_covered: fr ? "Pris en charge par l’hôte" : "Host covered",
    not_covered: fr ? "Non pris en charge" : "Not covered",
    discuss: fr ? "À convenir" : "To be discussed",
  }[request.logistics.travel];
  const honorariumLabel = request.logistics.honorarium
    ? {
        offered: fr ? "Proposé" : "Offered",
        not_offered: fr ? "Non proposé" : "Not offered",
        discuss: fr ? "À convenir" : "To be discussed",
      }[request.logistics.honorarium]
    : undefined;
  const permissions = [
    ...rider.recordingAndRepublication,
    `${fr ? "Enregistrement" : "Recording"}: ${request.ask.recording ? yes : no}`,
    `${fr ? "Transcription" : "Transcript"}: ${request.ask.transcriptRights ? yes : no}`,
    `${fr ? "Republication" : "Republication"}: ${request.ask.republicationRights ? yes : no}`,
  ];
  const honorarium =
    request.capacity === "personal" && honorariumLabel
      ? `<section><h2>${fr ? "Honoraires" : "Honorarium"}</h2>${list(rider.honorariumTerms)}<p>${escapeHtml(honorariumLabel)}</p></section>`
      : "";
  const timing = [
    ...rider.timing,
    input.arrivalTime,
    input.briefingWindow,
    input.rehearsalRequirement,
  ].filter((item): item is string => Boolean(item));
  const protocol = [
    ...rider.protocolRequirements,
    `${fr ? "Lettre d’invitation" : "Invitation letter"}: ${request.logistics.invitationLetter ? yes : no}`,
    `${fr ? "Appui visa" : "Visa support"}: ${request.logistics.visaLetter ? yes : no}`,
    `${fr ? "Protocole gouvernemental" : "Government protocol"}: ${request.logistics.governmentProtocol ? yes : no}`,
  ];
  return `<!doctype html><html lang="${escapeHtml(request.locale)}"><head><meta charset="utf-8"><style>@page{size:A4;margin:11mm}*{box-sizing:border-box}body{color:#101820;font:8.5pt/1.28 Arial,sans-serif;margin:0}header{display:grid;grid-template-columns:1fr 31mm;gap:8mm;border-bottom:1.5px solid #a66f2c;padding-bottom:4mm}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:20pt;line-height:1.05;margin:2mm 0}h2{font-size:11.5pt;margin:0 0 1.5mm}p{margin:1.5mm 0}section{margin:3.5mm 0;break-inside:avoid}ul{margin:0;padding-left:5mm}img{width:31mm;height:38mm;object-fit:cover}.meta{font:7pt ui-monospace,monospace;color:#4b5563}.grid{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm 8mm}.grid section{margin:1.5mm 0}li{margin-bottom:.8mm}body>.meta{border-top:1px solid #d7dce1;padding-top:2mm;margin-top:3mm}</style></head><body><header><div><p class="meta">PROJECT AMANOR · ${fr ? "NOTE DE PROTOCOLE" : "PROTOCOL NOTE"} · ${escapeHtml(request.reference)}</p><h1>${escapeHtml(identity.legalName)}</h1><p>${escapeHtml(currentTitle.title)} · ${escapeHtml(currentTitle.organisation)}</p><p>${escapeHtml(request.engagement.eventName)} · ${escapeHtml(new Intl.DateTimeFormat(request.locale, { dateStyle: "long" }).format(request.engagement.startsAt))}</p></div><div><img src="${portrait.imageDataUri}" alt=""><p class="meta">${escapeHtml(portrait.credit)} · ${escapeHtml(portrait.licence)}</p></div></header><section><h2>${fr ? "Biographie approuvée" : "Approved biography"}</h2><p>${escapeHtml(identity.bio120)}</p></section><div class="grid"><section><h2>${fr ? "Exigences techniques" : "Technical requirements"}</h2>${list(technical)}${input.displayRequirements ? `<p>${escapeHtml(input.displayRequirements)}</p>` : ""}${input.lecternRequired !== undefined ? `<p>${fr ? "Pupitre" : "Lectern"}: ${input.lecternRequired ? yes : no}</p>` : ""}</section><section><h2>${fr ? "Calendrier" : "Timing"}</h2>${timing.length ? list(timing) : `<p>—</p>`}</section><section><h2>${fr ? "Voyage et logistique" : "Travel and logistics"}</h2>${list([...rider.travelAndAccommodation, ...logistics])}<p>${escapeHtml(travelLabel)}</p></section><section><h2>${fr ? "Accessibilité" : "Accessibility"}</h2>${accessibility.length ? list(accessibility) : `<p>—</p>`}</section><section><h2>${fr ? "Droits médias" : "Media permissions"}</h2>${list(permissions)}</section><section><h2>${fr ? "Protocole" : "Protocol"}</h2>${list(protocol)}<p>${fr ? "Formule" : "Form of address"}: ${escapeHtml(identity.honorific)} ${escapeHtml(identity.shortName)}</p></section></div>${honorarium}<section><h2>${fr ? "Contacts" : "Contacts"}</h2>${list(rider.contactRequirements)}<p>${escapeHtml(request.logistics.contactName)} · ${escapeHtml(request.logistics.contactPhone)}</p><p>${escapeHtml(input.speakerContactName)} · ${escapeHtml(input.speakerContactEmail)}</p></section><p class="meta">${escapeHtml(rider.name)} · ${escapeHtml(rider.versionLabel)} · ${escapeHtml(view.generatedAt.toISOString())}</p></body></html>`;
}
