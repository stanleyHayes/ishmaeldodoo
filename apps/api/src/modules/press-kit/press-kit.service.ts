import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { resolveDateRangedRecord } from "@amanor/contracts";
import JSZip from "jszip";
import { z } from "zod";
import { CmsService } from "../content/application/cms.service";
import { MediaService } from "../media/application/media.service";
import type { GeneratePressKitDto } from "./press-kit.dto";
import { PressKitRepository } from "./press-kit.repository";
import { BrowserPdfService, escapeHtml } from "./browser-pdf.service";

const identitySchema = z.object({
  legalName: z.string(),
  honorific: z.string(),
  displayName: z.string(),
  pronunciationGuide: z.string(),
  bio40: z.string(),
  bio120: z.string(),
  bio300: z.string(),
  portraits: z.array(z.string().uuid()).max(3),
  titleHistory: z.array(
    z.object({
      title: z.string(),
      longFormTitle: z.string(),
      organisation: z.string(),
      from: z.coerce.date(),
      to: z.coerce.date().nullable(),
      sourceRef: z.string(),
    }),
  ),
});

export type GeneratedPressKit = Readonly<{
  body: Buffer<ArrayBufferLike>;
  contentType: string;
  filename: string;
  requestId: string;
}>;

@Injectable()
export class PressKitService {
  constructor(
    private readonly cms: CmsService,
    private readonly media: MediaService,
    private readonly repository: PressKitRepository,
    private readonly browser: BrowserPdfService,
  ) {}

  async generate(
    input: GeneratePressKitDto,
    now = new Date(),
  ): Promise<GeneratedPressKit> {
    const projection = await this.cms.publicProjection(
      "identity",
      "canonical",
      input.locale,
    );
    const parsed = identitySchema.safeParse(projection?.payload);
    if (!parsed.success)
      throw new NotFoundException("The approved press kit is not available");
    const current = resolveDateRangedRecord(parsed.data.titleHistory, now);
    if (!current)
      throw new NotFoundException(
        "The approved current title is not available",
      );
    const requestId = randomUUID();
    let body: Buffer<ArrayBufferLike> = await this.browser.render(
      pressKitHtml(
        parsed.data,
        current,
        input.outlet,
        input.locale,
        now,
        requestId,
      ),
    );
    let contentType = "application/pdf";
    let extension = "pdf";
    if (input.format === "zip") {
      const zip = new JSZip();
      zip.file("press-kit.pdf", body);
      for (const [index, assetId] of parsed.data.portraits.entries()) {
        const asset = await this.media.publicAsset(assetId);
        if (!asset || asset.resourceType !== "image") continue;
        const url = new URL(asset.secureUrl);
        if (
          url.protocol !== "https:" ||
          !url.hostname.endsWith("cloudinary.com")
        )
          continue;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok)
          zip.file(
            `portrait-${index + 1}.${asset.format}`,
            Buffer.from(await response.arrayBuffer()),
          );
      }
      body = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      contentType = "application/zip";
      extension = "zip";
    }
    await this.repository.record({
      requestId,
      requesterName: input.requesterName.trim(),
      outlet: input.outlet.trim(),
      email: input.email.trim().toLowerCase(),
      locale: input.locale,
      format: input.format,
      generatedAt: now,
      expiresAt: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1_000),
    });
    return {
      body,
      contentType,
      filename: `amanor-press-kit-${now.toISOString().slice(0, 10)}.${extension}`,
      requestId,
    };
  }
}

export function pressKitHtml(
  identity: z.infer<typeof identitySchema>,
  current: z.infer<typeof identitySchema>["titleHistory"][number],
  outlet: string,
  locale: string,
  now: Date,
  requestId: string,
): string {
  const fr = locale === "fr-FR";
  const biographies = [
    ["40", identity.bio40],
    ["120", identity.bio120],
    ["300", identity.bio300],
  ]
    .map(
      ([length, text]) =>
        `<section><h2>${length} ${fr ? "mots" : "words"}</h2><p>${escapeHtml(text)}</p></section>`,
    )
    .join("");
  return `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;color:#111318;font:10.5pt/1.5 Arial,sans-serif}header{min-height:95mm;padding:18mm 14mm;background:#0e1d2a;color:#fff;break-after:page}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:32pt;line-height:1;margin:24mm 0 8mm}h2{font-size:20pt;border-bottom:.5pt solid #aaa;padding-bottom:3mm}section{break-inside:avoid;margin-bottom:10mm}.reference{position:fixed;right:0;bottom:0;font:7pt ui-monospace,monospace;color:#777}.meta{font:8pt ui-monospace,monospace}</style></head><body><p class="reference">${escapeHtml(requestId)}</p><header><p class="meta">PROJECT AMANOR · ${fr ? "DOSSIER DE PRESSE" : "PRESS KIT"}</p><h1>${escapeHtml(identity.displayName)}</h1><p>${escapeHtml(current.longFormTitle)} · ${escapeHtml(current.organisation)}</p><p>${fr ? "Prononciation" : "Pronunciation"}: ${escapeHtml(identity.pronunciationGuide)}</p><p class="meta">${escapeHtml(outlet.trim())} · ${escapeHtml(now.toISOString().slice(0, 10))}</p></header>${biographies}</body></html>`;
}
