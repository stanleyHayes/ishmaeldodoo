import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { SourceAuditReport } from "@amanor/contracts";
import { AccessTokenGuard } from "../../auth/http/access-token.guard";
import { AdminMutationOriginGuard } from "../../../common/admin-mutation-origin.guard";
import type { AuthenticatedRequest } from "../../auth/http/authenticated-request";
import { CmsService } from "../application/cms.service";
import {
  contentKindSchema,
  type ContentKind,
  type EditorialActor,
} from "../domain/types";
import type {
  AuditExport,
  ContentDocumentPage,
  ContentVersion,
  EditorialAuditIntegrity,
  Publication,
  Unpublication,
} from "../domain/workflow";
import type { EditorialAuditEvent } from "../application/audit";
import {
  CreateDraftDto,
  PublishContentDto,
  TransitionContentDto,
} from "./cms.dto";

@ApiTags("cms")
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, AdminMutationOriginGuard)
@Controller("cms/content")
export class CmsController {
  constructor(@Inject(CmsService) private readonly cms: CmsService) {}

  @Post(":documentType/:documentId/versions")
  @ApiCreatedResponse({
    description: "A new immutable draft version was created.",
  })
  async createDraft(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Body() input: CreateDraftDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ContentVersion> {
    if (
      !input.payload ||
      typeof input.payload !== "object" ||
      Array.isArray(input.payload)
    ) {
      throw new BadRequestException("Content payload must be an object");
    }
    return this.execute(() =>
      this.cms.createDraft(
        this.kind(rawType),
        this.documentId(documentId),
        input.payload,
        this.actor(request),
      ),
    );
  }

  @Get(":documentType/:documentId/versions")
  @ApiOkResponse({
    description: "Version history for the requested content document.",
  })
  async versions(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<readonly ContentVersion[]> {
    return this.execute(() =>
      this.cms.listVersions(
        this.kind(rawType),
        this.documentId(documentId),
        this.actor(request),
      ),
    );
  }

  @Get(":documentType/:documentId/audit")
  @ApiOkResponse({
    description: "Immutable audit history for the requested content document.",
  })
  async audit(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Req() request: AuthenticatedRequest,
    @Query("limit") rawLimit?: string,
  ): Promise<readonly EditorialAuditEvent[]> {
    this.kind(rawType);
    const limit = rawLimit === undefined ? 100 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 250)
      throw new BadRequestException("Audit limit must be between 1 and 250");
    return this.execute(() =>
      this.cms.listAudit(
        this.kind(rawType),
        this.documentId(documentId),
        limit,
        this.actor(request),
      ),
    );
  }

  @Get(":documentType/:documentId/audit/export")
  @ApiOkResponse({
    description: "Portable, hash-linked editorial audit export.",
  })
  async auditExport(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Req() request: AuthenticatedRequest,
    @Query("limit") rawLimit?: string,
  ): Promise<AuditExport> {
    const limit = rawLimit === undefined ? 250 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 250)
      throw new BadRequestException("Audit limit must be between 1 and 250");
    return this.execute(() =>
      this.cms.exportAudit(
        this.kind(rawType),
        this.documentId(documentId),
        limit,
        this.actor(request),
      ),
    );
  }

  @Get(":documentType/:documentId/audit/integrity")
  @ApiOkResponse({ description: "Editorial audit-chain integrity status." })
  async auditIntegrity(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<EditorialAuditIntegrity> {
    return this.execute(() =>
      this.cms.verifyAuditIntegrity(
        this.kind(rawType),
        this.documentId(documentId),
        this.actor(request),
      ),
    );
  }

  @Post(":documentType/:documentId/versions/:version/actions")
  @ApiOkResponse({
    description: "The editorial workflow transition was applied atomically.",
  })
  async transition(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Param("version", ParseIntPipe) version: number,
    @Body() input: TransitionContentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ContentVersion> {
    const scheduledFor = input.scheduledFor
      ? new Date(input.scheduledFor)
      : undefined;
    if (scheduledFor && Number.isNaN(scheduledFor.getTime()))
      throw new BadRequestException("scheduledFor must be an ISO date");
    return this.execute(() =>
      this.cms.transition(
        this.kind(rawType),
        this.documentId(documentId),
        version,
        input.action,
        this.actor(request),
        {
          ...(input.policySensitive === undefined
            ? {}
            : { policySensitive: input.policySensitive }),
          ...(scheduledFor ? { scheduledFor } : {}),
        },
      ),
    );
  }

  @Post(":documentType/:documentId/versions/:version/publish")
  @ApiOkResponse({
    description: "Approved content was published and revalidation queued.",
  })
  async publish(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Param("version", ParseIntPipe) version: number,
    @Body() input: PublishContentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Publication> {
    return this.execute(() =>
      this.cms.publish(
        this.kind(rawType),
        this.documentId(documentId),
        version,
        input.locale,
        this.actor(request),
      ),
    );
  }

  @Post(":documentType/:documentId/versions/:version/rollback")
  @HttpCode(200)
  @ApiOkResponse({
    description:
      "A previously published immutable version was restored for one locale.",
  })
  async rollback(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Param("version", ParseIntPipe) version: number,
    @Body() input: PublishContentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Publication> {
    return this.execute(() =>
      this.cms.rollback(
        this.kind(rawType),
        this.documentId(documentId),
        version,
        input.locale,
        this.actor(request),
      ),
    );
  }

  @Post(":documentType/:documentId/unpublish")
  @HttpCode(200)
  @ApiOkResponse({
    description: "The locale publication was removed and audited atomically.",
  })
  async unpublish(
    @Param("documentType") rawType: string,
    @Param("documentId") documentId: string,
    @Body() input: PublishContentDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Unpublication> {
    return this.execute(() =>
      this.cms.unpublish(
        this.kind(rawType),
        this.documentId(documentId),
        input.locale,
        this.actor(request),
      ),
    );
  }

  @Get(":documentType")
  @ApiOkResponse({
    description:
      "A bounded page of content documents with their latest workflow state.",
  })
  async documents(
    @Param("documentType") rawType: string,
    @Req() request: AuthenticatedRequest,
    @Query("limit") rawLimit?: string,
    @Query("cursor") rawCursor?: string,
  ): Promise<ContentDocumentPage> {
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException("Document limit must be between 1 and 100");
    const cursor =
      rawCursor === undefined ? undefined : this.documentId(rawCursor);
    return this.execute(() =>
      this.cms.listDocuments(
        this.kind(rawType),
        limit,
        cursor,
        this.actor(request),
      ),
    );
  }

  @Get("source-audit/report")
  @ApiOkResponse({
    description:
      "Complete no-sampling Source Register and published claim-reference audit.",
  })
  sourceAudit(
    @Req() request: AuthenticatedRequest,
  ): Promise<SourceAuditReport> {
    return this.execute(() => this.cms.sourceAudit(this.actor(request)));
  }

  private kind(raw: string): ContentKind {
    const result = contentKindSchema.safeParse(raw);
    if (!result.success)
      throw new BadRequestException("Content type is invalid");
    return result.data;
  }

  private actor(request: AuthenticatedRequest): EditorialActor {
    return { id: request.auth.subject, roles: request.auth.roles };
  }

  private documentId(raw: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(raw))
      throw new BadRequestException("Document identifier is invalid");
    return raw;
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "CMS operation failed";
      if (
        /permission|role|required to publish|different approver/iu.test(message)
      )
        throw new ForbiddenException(message);
      throw new BadRequestException(message);
    }
  }
}
