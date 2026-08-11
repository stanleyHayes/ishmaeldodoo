import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { assertTrustedMutationOrigin } from "../../auth/application/request-security";
import { AccessTokenGuard } from "../../auth/http/access-token.guard";
import type { AuthenticatedRequest } from "../../auth/http/authenticated-request";
import { projectPublicLocale } from "../../content/domain/public-projection";
import { localeSchema, type EditorialActor } from "../../content/domain/types";
import { MediaService } from "../application/media.service";
import {
  completeUploadSchema,
  mediaAssetListQuerySchema,
  mediaMetadataUpdateSchema,
  signUploadSchema,
  type MediaAsset,
  type MediaAssetPage,
  type MediaInventoryReport,
} from "../domain/media";
import type { SignedUpload } from "../infrastructure/cloudinary.service";
import { PublicServiceGuard } from "../../../common/public-service.guard";

type PublicMediaResponse = Readonly<{
  assetId: string;
  secureUrl: string;
  resourceType: string;
  format: string;
  width?: number;
  height?: number;
  duration?: number;
  bytes: number;
  version: number;
  altText: unknown;
  credit: string;
  licence: string;
  sourceRef: string;
  focalPoint?: MediaAsset["focalPoint"];
}>;

@ApiTags("media")
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller("media")
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(ConfigService) private readonly configuration: ConfigService,
  ) {}

  @Post("uploads/sign")
  @HttpCode(200)
  @ApiOkResponse({
    description:
      "Short-lived signed Cloudinary upload parameters without the API secret.",
  })
  signUpload(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<SignedUpload> {
    this.assertOrigin(origin);
    const parsed = signUploadSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Upload signing request is invalid");
    return this.execute(() =>
      Promise.resolve(
        this.media.signUpload(
          parsed.data.folder,
          parsed.data.resourceType,
          this.actor(request),
        ),
      ),
    );
  }

  @Get("assets")
  @ApiOkResponse({
    description: "Bounded active governed media library for CMS operators.",
  })
  listAssets(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<MediaAssetPage> {
    const parsed = mediaAssetListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException("Media library query is invalid");
    return this.execute(() =>
      this.media.listAssets(parsed.data, this.actor(request)),
    );
  }

  @Get("assets/inventory")
  @ApiOkResponse({
    description:
      "Complete bounded media governance inventory including gaps and publication references.",
  })
  inventory(
    @Req() request: AuthenticatedRequest,
  ): Promise<MediaInventoryReport> {
    return this.execute(() => this.media.inventory(this.actor(request)));
  }

  @Post("assets")
  @ApiCreatedResponse({
    description:
      "Cloudinary asset independently verified and registered with governance metadata.",
  })
  async completeUpload(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<MediaAsset> {
    this.assertOrigin(origin);
    const parsed = completeUploadSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Media metadata is invalid");
    return this.execute(() =>
      this.media.completeUpload(parsed.data, this.actor(request)),
    );
  }

  @Patch("assets/:assetId")
  @ApiOkResponse({
    description:
      "Governed alt text, rights, source and non-destructive focal-point metadata updated.",
  })
  async updateAsset(
    @Param("assetId") assetId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<MediaAsset> {
    this.assertOrigin(origin);
    if (!/^[a-f0-9-]{36}$/u.test(assetId))
      throw new NotFoundException("Media asset was not found");
    const parsed = mediaMetadataUpdateSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Media metadata is invalid");
    return this.execute(() =>
      this.media.updateMetadata(assetId, parsed.data, this.actor(request)),
    );
  }

  @Delete("assets/:assetId")
  @HttpCode(204)
  @ApiNoContentResponse({
    description: "Cloudinary asset invalidated and registry record retired.",
  })
  async deleteAsset(
    @Param("assetId") assetId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<void> {
    this.assertOrigin(origin);
    if (!/^[a-f0-9-]{36}$/u.test(assetId))
      throw new NotFoundException("Media asset was not found");
    await this.execute(() =>
      this.media.deleteAsset(assetId, this.actor(request)),
    );
  }

  private actor(request: AuthenticatedRequest): EditorialActor {
    return { id: request.auth.subject, roles: request.auth.roles };
  }

  private assertOrigin(origin: string | undefined): void {
    try {
      assertTrustedMutationOrigin(
        origin ?? null,
        this.configuration.getOrThrow<string>("ADMIN_ORIGIN"),
      );
    } catch {
      throw new ForbiddenException("Request origin is not allowed");
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Media operation failed";
      if (/role/iu.test(message)) throw new ForbiddenException(message);
      if (/not found/iu.test(message)) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
  }
}

@ApiTags("public-media")
@Controller("public/media")
@UseGuards(PublicServiceGuard)
export class PublicMediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Get(":assetId")
  @ApiOkResponse({
    description: "Delivery-safe metadata for an active governed media asset.",
  })
  async asset(
    @Param("assetId") assetId: string,
    @Query("locale") rawLocale = "en-GB",
  ): Promise<PublicMediaResponse> {
    const locale = localeSchema.safeParse(rawLocale);
    if (!locale.success || !/^[a-f0-9-]{36}$/u.test(assetId))
      throw new NotFoundException("Media asset was not found");
    const asset = await this.media.publicAsset(assetId);
    if (!asset) throw new NotFoundException("Media asset was not found");
    return {
      assetId: asset.assetId,
      secureUrl: asset.secureUrl,
      resourceType: asset.resourceType,
      format: asset.format,
      bytes: asset.bytes,
      version: asset.version,
      altText: projectPublicLocale(asset.altText, locale.data),
      credit: asset.credit,
      licence: asset.licence,
      sourceRef: asset.sourceRef,
      ...(asset.focalPoint === undefined
        ? {}
        : { focalPoint: asset.focalPoint }),
      ...(asset.width === undefined ? {} : { width: asset.width }),
      ...(asset.height === undefined ? {} : { height: asset.height }),
      ...(asset.duration === undefined ? {} : { duration: asset.duration }),
    };
  }
}
