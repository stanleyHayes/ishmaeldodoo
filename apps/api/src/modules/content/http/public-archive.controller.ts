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
import { z } from "zod";

const archiveQuerySchema = z.object({
  locale: localeSchema.default("en-GB"),
  q: z.string().trim().max(100).optional(),
  type: z
    .enum(["speech", "interview", "panel", "article", "broadcast"])
    .optional(),
});

@ApiTags("public-content")
@Controller("public/archive")
@UseGuards(PublicServiceGuard)
export class PublicArchiveController {
  constructor(@Inject(CmsService) private readonly cms: CmsService) {}

  @Get()
  @ApiOkResponse({
    description: "At most 50 published, locale-projected Archive entries.",
  })
  async list(
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Awaited<ReturnType<CmsService["listPublicArchive"]>>> {
    const query = archiveQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new NotFoundException("Archive was not found");
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    return this.cms.listPublicArchive(
      query.data.locale,
      query.data.q,
      query.data.type,
    );
  }
}
