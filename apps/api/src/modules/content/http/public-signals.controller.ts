import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { PublicServiceGuard } from "../../../common/public-service.guard";
import { CmsService } from "../application/cms.service";
import { localeSchema } from "../domain/types";

@ApiTags("public-content")
@Controller("public/signals")
@UseGuards(PublicServiceGuard)
export class PublicSignalsController {
  constructor(@Inject(CmsService) private readonly cms: CmsService) {}

  @Get()
  @ApiOkResponse({ description: "At most 50 published Signal projections." })
  async list(
    @Query("locale") rawLocale = "en-GB",
    @Res({ passthrough: true }) response: Response,
  ): Promise<Awaited<ReturnType<CmsService["listPublicSignals"]>>> {
    const locale = localeSchema.safeParse(rawLocale);
    if (!locale.success) throw new NotFoundException("Signals were not found");
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    return this.cms.listPublicSignals(locale.data);
  }

  @Get("latest")
  @ApiOkResponse({
    description: "The most recently dated published Signal projection.",
  })
  async latest(
    @Query("locale") rawLocale = "en-GB",
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const locale = localeSchema.safeParse(rawLocale);
    if (!locale.success) throw new NotFoundException("Signal was not found");
    const result = await this.cms.latestPublicSignal(locale.data);
    if (!result) throw new NotFoundException("Signal was not found");
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    return {
      documentId: result.documentId,
      ...(result.payload as Record<string, unknown>),
      translation: result.translation,
    };
  }
}
