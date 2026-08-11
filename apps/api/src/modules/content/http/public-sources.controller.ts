import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CmsService } from "../application/cms.service";
import { localeSchema } from "../domain/types";
import type { PublicSourcePage } from "../persistence/cms.repository";
import { PublicServiceGuard } from "../../../common/public-service.guard";

@ApiTags("public-content")
@Controller("public/sources")
@UseGuards(PublicServiceGuard)
export class PublicSourcesController {
  constructor(@Inject(CmsService) private readonly cms: CmsService) {}

  @Get()
  @ApiOkResponse({
    description:
      "Published Source Register entries without confidential editorial notes.",
  })
  async list(
    @Query("locale") rawLocale = "en-GB",
    @Query("limit") rawLimit = "25",
    @Query("cursor") rawCursor?: string,
    @Query("q") rawQuery?: string,
    @Res({ passthrough: true }) response?: Response,
  ): Promise<PublicSourcePage> {
    const locale = localeSchema.safeParse(rawLocale);
    const limit = Number(rawLimit);
    if (!locale.success || !Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestException("Source Register query is invalid");
    if (rawCursor && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(rawCursor))
      throw new BadRequestException("Source Register cursor is invalid");
    const query = rawQuery?.trim();
    if (query && query.length > 100)
      throw new BadRequestException("Source Register search is too long");
    response?.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    return this.cms.listPublicSources(
      locale.data,
      limit,
      rawCursor,
      query || undefined,
    );
  }
}
