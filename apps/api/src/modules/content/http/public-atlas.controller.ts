import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CmsService } from "../application/cms.service";
import { localeSchema } from "../domain/types";
import { NotFoundException } from "@nestjs/common";
import { PublicServiceGuard } from "../../../common/public-service.guard";
@ApiTags("public-content")
@Controller("public/atlas")
@UseGuards(PublicServiceGuard)
export class PublicAtlasController {
  constructor(private readonly cms: CmsService) {}
  @Get()
  @ApiOkResponse({
    description: "At most 60 published locale-projected Atlas nodes.",
  })
  async list(
    @Query("locale") rawLocale = "en-GB",
    @Res({ passthrough: true }) response: Response,
  ): Promise<
    Readonly<{
      items: readonly unknown[];
      translation: { stale: boolean; sourceUpdatedAt?: Date };
    }>
  > {
    const locale = localeSchema.safeParse(rawLocale);
    if (!locale.success) throw new NotFoundException("Atlas was not found");
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    return this.cms.listPublicAtlas(locale.data);
  }
}
