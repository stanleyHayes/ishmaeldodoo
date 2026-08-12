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
@Controller("public/legacy")
@UseGuards(PublicServiceGuard)
export class PublicLegacyController {
  constructor(@Inject(CmsService) private readonly cms: CmsService) {}

  @Get()
  @ApiOkResponse({ description: "Published consent-granted scholar profiles." })
  async list(
    @Query("locale") rawLocale: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Awaited<ReturnType<CmsService["listPublicScholars"]>>> {
    const locale = localeSchema.safeParse(rawLocale ?? "en-GB");
    if (!locale.success) throw new NotFoundException("Legacy was not found");
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    );
    return this.cms.listPublicScholars(locale.data);
  }
}
