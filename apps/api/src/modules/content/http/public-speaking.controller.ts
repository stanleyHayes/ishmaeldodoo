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
@Controller("public/speaking")
@UseGuards(PublicServiceGuard)
export class PublicSpeakingController {
  constructor(@Inject(CmsService) private readonly cms: CmsService) {}

  @Get()
  @ApiOkResponse({
    description: "At most 50 published, locale-projected speaking themes.",
  })
  async list(
    @Query("locale") rawLocale = "en-GB",
    @Res({ passthrough: true }) response: Response,
  ): Promise<Awaited<ReturnType<CmsService["listPublicSpeakingThemes"]>>> {
    const locale = localeSchema.safeParse(rawLocale);
    if (!locale.success) throw new NotFoundException("Speaking was not found");
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    return this.cms.listPublicSpeakingThemes(locale.data);
  }
}
