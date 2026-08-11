import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CmsService } from "../application/cms.service";
import { contentKindSchema, localeSchema } from "../domain/types";
import { PublicServiceGuard } from "../../../common/public-service.guard";

const genericPublicKinds = new Set(["identity", "page"]);

@ApiTags("public-content")
@Controller("public/content")
@UseGuards(PublicServiceGuard)
export class PublicContentController {
  constructor(@Inject(CmsService) private readonly cms: CmsService) {}

  @Get(":documentType/:documentId")
  @ApiOkResponse({
    description:
      "A published, locale-specific content projection. Drafts are never returned.",
  })
  async getPublished(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Query("locale") rawLocale = "en-GB",
    @Res({ passthrough: true }) response: Response,
  ): Promise<
    Readonly<{
      documentType: string;
      documentId: string;
      locale: string;
      version: number;
      publishedAt: Date;
      payload: unknown;
      translation: { stale: boolean; sourceUpdatedAt?: Date };
    }>
  > {
    const type = contentKindSchema.safeParse(rawType);
    const locale = localeSchema.safeParse(rawLocale);
    if (
      !type.success ||
      !locale.success ||
      (type.success && !genericPublicKinds.has(type.data)) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(documentId)
    )
      throw new NotFoundException("Published content was not found");
    const result = await this.cms.publicProjection(
      type.data,
      documentId,
      locale.data,
    );
    if (!result) throw new NotFoundException("Published content was not found");
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    return {
      ...result.publication,
      payload: result.payload,
      translation: result.translation,
    };
  }
}
