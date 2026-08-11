import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { resolveDateRangedRecord } from "@amanor/contracts";
import { z } from "zod";
import { CmsService } from "../content/application/cms.service";
import { BrowserPdfService, escapeHtml } from "./browser-pdf.service";
import type { GenerateLivingDossierDto } from "./living-dossier.dto";
import { PressKitRepository } from "./press-kit.repository";

const identitySchema = z.object({
  displayName: z.string(),
  pronunciationGuide: z.string(),
  bio120: z.string(),
  bio300: z.string(),
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
const pageSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(
    z.object({
      heading: z.string().optional(),
      body: z.string(),
      sourceRefs: z.array(z.string()).optional(),
    }),
  ),
});
const atlasSchema = z
  .array(
    z.object({
      label: z.string(),
      role: z.string(),
      institution: z.string(),
      country: z.string(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date().nullable(),
      outcomes: z.array(z.string()),
      portfolioValue: z.number().optional(),
      currency: z.string().optional(),
      valueYear: z.number().optional(),
      sourceRefs: z.array(z.string()),
    }),
  )
  .max(60);

export type GeneratedLivingDossier = Readonly<{
  body: Buffer<ArrayBufferLike>;
  filename: string;
  requestId: string;
}>;

@Injectable()
export class LivingDossierService {
  constructor(
    private readonly cms: CmsService,
    private readonly browser: BrowserPdfService,
    private readonly repository: PressKitRepository,
  ) {}

  async generate(
    input: GenerateLivingDossierDto,
    now = new Date(),
  ): Promise<GeneratedLivingDossier> {
    const requestId = randomUUID();
    const [
      identityProjection,
      atlasProjection,
      recordProjection,
      speakingProjection,
    ] = await Promise.all([
      this.cms.publicProjection("identity", "canonical", input.locale),
      this.cms.listPublicAtlas(input.locale),
      input.variant === "full"
        ? this.cms.publicProjection("page", "record", input.locale)
        : Promise.resolve(null),
      input.variant !== "institutional"
        ? this.cms.publicProjection("page", "speaking", input.locale)
        : Promise.resolve(null),
    ]);
    const identity = identitySchema.safeParse(identityProjection?.payload);
    const atlas = atlasSchema.safeParse(atlasProjection.items);
    if (!identity.success || !atlas.success)
      throw new NotFoundException(
        "The approved living dossier is not available",
      );
    const record = pageSchema.safeParse(recordProjection?.payload);
    const speaking = pageSchema.safeParse(speakingProjection?.payload);
    const html = livingDossierHtml({
      input,
      identity: identity.data,
      atlas: atlas.data,
      record: record.success ? record.data : null,
      speaking: speaking.success ? speaking.data : null,
      requestId,
      now,
    });
    const body = await this.browser.render(html);
    await this.repository.recordDossier({
      requestId,
      requesterName: input.requesterName.trim(),
      organisation: input.organisation.trim(),
      email: input.email.trim().toLowerCase(),
      purpose: input.purpose.trim(),
      locale: input.locale,
      variant: input.variant,
      generatedAt: now,
      expiresAt: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1_000),
    });
    return {
      body,
      filename: `amanor-${input.variant}-dossier-${now.toISOString().slice(0, 10)}.pdf`,
      requestId,
    };
  }
}

type HtmlInput = Readonly<{
  input: GenerateLivingDossierDto;
  identity: z.infer<typeof identitySchema>;
  atlas: z.infer<typeof atlasSchema>;
  record: z.infer<typeof pageSchema> | null;
  speaking: z.infer<typeof pageSchema> | null;
  requestId: string;
  now: Date;
}>;
export function livingDossierHtml(data: HtmlInput): string {
  const fr = data.input.locale === "fr-FR";
  const current = resolveDateRangedRecord(data.identity.titleHistory, data.now);
  const title =
    data.input.variant === "speaker"
      ? fr
        ? "Dossier d’intervention"
        : "Speaker Pack"
      : data.input.variant === "institutional"
        ? fr
          ? "Dossier institutionnel"
          : "Institutional Dossier"
        : fr
          ? "Dossier complet"
          : "Full Record";
  const section = (heading: string, body: string): string =>
    `<section><h2>${escapeHtml(heading)}</h2>${body}</section>`;
  const pageSections = (page: z.infer<typeof pageSchema> | null): string =>
    page
      ? page.sections
          .map(
            (item) =>
              `<article><h3>${escapeHtml(item.heading ?? page.title)}</h3>${item.body
                .split("\n")
                .filter(Boolean)
                .map((text) => `<p>${escapeHtml(text)}</p>`)
                .join(
                  "",
                )}${item.sourceRefs?.length ? `<p class="sources">${escapeHtml(fr ? "Sources" : "Sources")}: ${item.sourceRefs.map(escapeHtml).join(", ")}</p>` : ""}</article>`,
          )
          .join("")
      : "";
  const atlasRows = data.atlas
    .map(
      (item) =>
        `<tr><td>${item.startDate.getUTCFullYear()}-${item.endDate?.getUTCFullYear() ?? (fr ? "présent" : "present")}</td><td><strong>${escapeHtml(item.role)}</strong><br>${escapeHtml(item.institution)} · ${escapeHtml(item.country)}</td><td>${item.outcomes.map(escapeHtml).join(" ")}${item.portfolioValue !== undefined ? `<br>${escapeHtml(item.currency ?? "")} ${escapeHtml(item.portfolioValue.toLocaleString(data.input.locale))}${item.valueYear ? ` (${item.valueYear})` : ""}` : ""}<br><span class="sources">${item.sourceRefs.map(escapeHtml).join(", ")}</span></td></tr>`,
    )
    .join("");
  const narrative =
    data.input.variant === "speaker"
      ? section(fr ? "Interventions" : "Speaking", pageSections(data.speaking))
      : data.input.variant === "institutional"
        ? ""
        : section(fr ? "Le parcours" : "The Record", pageSections(data.record));
  const atlasSection =
    data.input.variant === "speaker"
      ? ""
      : section(
          fr ? "Registre vérifiable" : "Verified record",
          `<table><thead><tr><th>${fr ? "Dates" : "Dates"}</th><th>${fr ? "Mandat" : "Mandate"}</th><th>${fr ? "Résultats" : "Outcomes"}</th></tr></thead><tbody>${atlasRows}</tbody></table>`,
        );
  return `<!doctype html><html lang="${escapeHtml(data.input.locale)}"><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm 16mm 20mm}*{box-sizing:border-box}body{margin:0;color:#111318;background:#fff;font:10.5pt/1.48 Arial,sans-serif}h1,h2,h3{font-family:Georgia,serif;font-weight:400}h1{font-size:34pt;line-height:1.02;margin:16mm 0 5mm}h2{font-size:21pt;border-bottom:.4pt solid #777;padding-bottom:3mm;break-after:avoid}h3{font-size:14pt;break-after:avoid}.cover{min-height:245mm;display:flex;flex-direction:column;justify-content:center;break-after:page}.eyebrow,.reference,.sources{font:8pt/1.4 ui-monospace,monospace;color:#5b6472}.personal{margin-top:18mm;padding-top:6mm;border-top:1pt solid #0b4f6c}.watermark{position:fixed;left:0;right:0;bottom:0;text-align:right;opacity:.42;font:7pt ui-monospace,monospace;color:#5b6472}section{break-before:page}article{break-inside:avoid;margin:0 0 7mm}table{width:100%;border-collapse:collapse;font-size:8.5pt}th,td{padding:3mm 2mm;border-bottom:.4pt solid #bbb;text-align:left;vertical-align:top}th{font-family:ui-monospace,monospace}.disclosure{margin-top:auto;font-size:8pt;color:#5b6472}</style></head><body><div class="watermark">${escapeHtml(data.requestId)}</div><section class="cover"><p class="eyebrow">PROJECT AMANOR · ${escapeHtml(title)}</p><h1>${escapeHtml(data.identity.displayName)}</h1><p>${escapeHtml(current ? `${current.title} · ${current.organisation}` : "")}</p><div class="personal"><p>${fr ? "Préparé pour" : "Prepared for"}</p><h2>${escapeHtml(data.input.organisation)}</h2><p>${escapeHtml(data.input.purpose)}</p><p class="reference">${fr ? "Généré le" : "Generated"} ${escapeHtml(data.now.toISOString().slice(0, 10))} · ${escapeHtml(data.requestId)}</p></div><p class="disclosure">${fr ? "Plateforme personnelle indépendante; ce document ne constitue pas une publication officielle du gouvernement." : "Independent personal platform; this document is not an official government publication."}</p></section>${section(fr ? "Profil approuvé" : "Approved profile", `<p>${escapeHtml(data.input.variant === "full" ? data.identity.bio300 : data.identity.bio120)}</p><p>${fr ? "Prononciation" : "Pronunciation"}: ${escapeHtml(data.identity.pronunciationGuide)}</p>`)}${narrative}${atlasSection}</body></html>`;
}
