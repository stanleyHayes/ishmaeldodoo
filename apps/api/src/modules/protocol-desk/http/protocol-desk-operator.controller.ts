import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  protocolDeskAssignmentSchema,
  protocolDeskAvailabilityQuerySchema,
  protocolDeskFlagClearanceSchema,
  protocolDeskNoteInputSchema,
  protocolDeskQueueQuerySchema,
  protocolDeskTransitionInputSchema,
  protocolNoteInputSchema,
  principalDecisionIssueSchema,
  type ProtocolDeskQueuePage,
  type ProtocolDeskRequestDetail,
  type ProtocolDeskOperations,
  type ProtocolDeskAvailability,
} from "@amanor/contracts";
import { assertTrustedMutationOrigin } from "../../auth/application/request-security";
import { AccessTokenGuard } from "../../auth/http/access-token.guard";
import type { AuthenticatedRequest } from "../../auth/http/authenticated-request";
import type { Role } from "../../auth/domain/roles";
import { ProtocolDeskService } from "../application/protocol-desk.service";
import { ProtocolNoteService } from "../application/protocol-note.service";
import type { Response } from "express";
import { ProtocolDeskOperationsService } from "../application/protocol-desk-operations.service";
import { AvailabilityService } from "../application/availability.service";

@ApiTags("protocol-desk-operator")
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller("desk/requests")
export class ProtocolDeskOperatorController {
  constructor(
    @Inject(ProtocolDeskService) private readonly desk: ProtocolDeskService,
    @Inject(ConfigService) private readonly configuration: ConfigService,
    @Inject(ProtocolNoteService)
    private readonly protocolNote: ProtocolNoteService,
    @Inject(ProtocolDeskOperationsService)
    private readonly operations: ProtocolDeskOperationsService,
    @Inject(AvailabilityService)
    private readonly availability: AvailabilityService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({
    description: "A bounded, score-ordered Protocol Desk operator queue.",
  })
  async queue(
    @Query() raw: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProtocolDeskQueuePage> {
    const parsed = protocolDeskQueueQuerySchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Protocol Desk queue query is invalid",
        issues: parsed.error.issues,
      });
    try {
      return await this.desk.queue(parsed.data, this.actor(request));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Protocol Desk queue failed";
      if (/operator role/iu.test(message))
        throw new ForbiddenException(message);
      if (/cursor is invalid/iu.test(message))
        throw new BadRequestException(message);
      throw error;
    }
  }

  @Get("operations")
  @Header("Cache-Control", "private, no-store")
  async operationalSnapshot(
    @Req() request: AuthenticatedRequest,
  ): Promise<ProtocolDeskOperations> {
    return this.execute(() => this.operations.snapshot(request.auth.roles));
  }

  @Get("availability")
  @Header("Cache-Control", "private, no-store")
  async availabilityCheck(
    @Query() raw: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProtocolDeskAvailability> {
    const parsed = protocolDeskAvailabilityQuerySchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException("Availability interval is invalid");
    return this.execute(() =>
      this.availability.check(parsed.data, request.auth.roles),
    );
  }

  @Get(":requestId")
  @Header("Cache-Control", "private, no-store")
  async detail(
    @Param("requestId") requestId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProtocolDeskRequestDetail> {
    const detail = await this.execute(() =>
      this.desk.detail(this.id(requestId), this.actor(request)),
    );
    if (!detail)
      throw new NotFoundException("Protocol Desk request was not found");
    return detail;
  }

  @Post(":requestId/assignment")
  async assign(
    @Param("requestId") requestId: string,
    @Body() raw: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOrigin(origin);
    const input = protocolDeskAssignmentSchema.safeParse(raw);
    if (!input.success) throw new BadRequestException("Assignment is invalid");
    return this.execute(() =>
      this.desk.assign(
        this.id(requestId),
        input.data.assigneeId,
        this.actor(request),
      ),
    );
  }

  @Post(":requestId/notes")
  async note(
    @Param("requestId") requestId: string,
    @Body() raw: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOrigin(origin);
    const input = protocolDeskNoteInputSchema.safeParse(raw);
    if (!input.success) throw new BadRequestException("Note is invalid");
    return this.execute(() =>
      this.desk.addNote(
        this.id(requestId),
        input.data.body,
        this.actor(request),
      ),
    );
  }

  @Post(":requestId/transitions")
  async transition(
    @Param("requestId") requestId: string,
    @Body() raw: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOrigin(origin);
    const input = protocolDeskTransitionInputSchema.safeParse(raw);
    if (!input.success) throw new BadRequestException("Transition is invalid");
    return this.execute(() =>
      this.desk.transition(
        this.id(requestId),
        input.data.state,
        input.data.reason,
        this.actor(request),
        input.data.declineCategory,
      ),
    );
  }

  @Post(":requestId/flags/:flagId/clearance")
  async clearFlag(
    @Param("requestId") requestId: string,
    @Param("flagId") flagId: string,
    @Body() raw: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOrigin(origin);
    const input = protocolDeskFlagClearanceSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Flag clearance is invalid");
    return this.execute(() =>
      this.desk.clearFlag(
        this.id(requestId),
        this.id(flagId),
        input.data.reason,
        this.actor(request),
      ),
    );
  }

  @Post(":requestId/correspondence/:correspondenceId/retry")
  async retryCorrespondence(
    @Param("requestId") requestId: string,
    @Param("correspondenceId") correspondenceId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOrigin(origin);
    return this.execute(() =>
      this.desk.retryCorrespondence(
        this.id(requestId),
        this.id(correspondenceId),
        this.actor(request),
      ),
    );
  }

  @Post(":requestId/calendar-sync/:syncId/retry")
  async retryCalendarSync(
    @Param("requestId") requestId: string,
    @Param("syncId") syncId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOrigin(origin);
    return this.execute(() =>
      this.desk.retryCalendarSync(
        this.id(requestId),
        this.id(syncId),
        this.actor(request),
      ),
    );
  }

  @Post(":requestId/principal-decision-delivery/:deliveryId/retry")
  async retryPrincipalDecisionDelivery(
    @Param("requestId") requestId: string,
    @Param("deliveryId") deliveryId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOrigin(origin);
    return this.execute(() =>
      this.desk.retryPrincipalDecisionDelivery(
        this.id(requestId),
        this.id(deliveryId),
        this.actor(request),
      ),
    );
  }

  @Post(":requestId/protocol-note")
  async generateProtocolNote(
    @Param("requestId") requestId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Headers("origin") origin?: string,
  ): Promise<void> {
    this.assertOrigin(origin);
    const result = await this.protocolNote.generateStored(
      this.id(requestId),
      request.auth.roles,
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.status(201).send(result.body);
  }

  @Post(":requestId/protocol-note/configuration")
  async configureProtocolNote(
    @Param("requestId") requestId: string,
    @Body() raw: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<ProtocolDeskRequestDetail> {
    this.assertOrigin(origin);
    const input = protocolNoteInputSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Protocol Note input is invalid");
    return this.execute(() =>
      this.desk.configureProtocolNote(
        this.id(requestId),
        input.data,
        this.actor(request),
      ),
    );
  }

  @Post(":requestId/principal-decision-capabilities")
  @Header("Cache-Control", "no-store")
  async issuePrincipalDecisionCapability(
    @Param("requestId") requestId: string,
    @Body() raw: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<Readonly<{ token: string; expiresAt: Date }>> {
    this.assertOrigin(origin);
    const input = principalDecisionIssueSchema.safeParse(raw);
    if (!input.success)
      throw new BadRequestException("Principal decision action is invalid");
    return this.execute(() =>
      this.desk.issuePrincipalDecisionCapability(
        this.id(requestId),
        input.data.action,
        this.actor(request),
      ),
    );
  }

  private actor(
    request: AuthenticatedRequest,
  ): Readonly<{ id: string; roles: readonly Role[] }> {
    return { id: request.auth.subject, roles: request.auth.roles };
  }
  private id(value: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value,
      )
    )
      throw new BadRequestException("Request identifier is invalid");
    return value;
  }
  private assertOrigin(origin?: string): void {
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
        error instanceof Error
          ? error.message
          : "Protocol Desk operation failed";
      if (/operator role|Only the Principal|Only Protocol Desk/iu.test(message))
        throw new ForbiddenException(message);
      if (/not found/iu.test(message)) throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
  }
}
