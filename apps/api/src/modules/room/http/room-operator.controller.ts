import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  roomDesignationSchema,
  roomExtensionSchema,
  roomReceiptSchema,
  roomStateChangeSchema,
  type RoomCiphertext,
  type RoomDesignationState,
  type RoomInboxPage,
  type RoomReceipt,
} from "@amanor/contracts";
import { assertTrustedMutationOrigin } from "../../auth/application/request-security";
import { AccessTokenGuard } from "../../auth/http/access-token.guard";
import type { AuthenticatedRequest } from "../../auth/http/authenticated-request";
import { hasPermission } from "../../auth/domain/roles";
import {
  RoomDesignationRejectedError,
  RoomDesignationService,
} from "../application/room-designation.service";
import {
  RoomEnquiryNotFoundError,
  RoomEnquiryService,
} from "../application/room-enquiry.service";
import { RoomAccessGuard } from "./room-access.guard";

/**
 * The restricted operator surface. `AccessTokenGuard` proves the session;
 * `RoomAccessGuard` proves the Room permission and the required authentication
 * factors. Every response is `private, no-store` so decrypted content cannot
 * persist in a shared cache and the ciphertext cannot persist in a local one.
 *
 * No route here accepts a search term, and none returns anything derived from
 * plaintext — there is no content index to search.
 */
@ApiTags("room-operator")
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, RoomAccessGuard)
@Controller("room")
export class RoomOperatorController {
  constructor(
    @Inject(RoomEnquiryService) private readonly enquiries: RoomEnquiryService,
    @Inject(RoomDesignationService)
    private readonly designations: RoomDesignationService,
    @Inject(ConfigService) private readonly configuration: ConfigService,
  ) {}

  @Get("enquiries")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ description: "Bounded metadata-only Room inbox." })
  async inbox(): Promise<RoomInboxPage> {
    return this.enquiries.inbox();
  }

  @Get("enquiries/:reference/ciphertext")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({
    description: "Ciphertext released for local decryption in the client.",
  })
  async ciphertext(
    @Param("reference") reference: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoomCiphertext> {
    this.assertReference(reference);
    try {
      return await this.enquiries.release(reference, this.actor(request));
    } catch (error) {
      throw this.translate(error);
    }
  }

  @Post("enquiries/:reference/state")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ description: "Room enquiry lifecycle state recorded." })
  async changeState(
    @Param("reference") reference: string,
    @Body() body: unknown,
    @Headers("origin") origin: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<{ status: "ok" }>> {
    this.assertOrigin(origin);
    this.assertReference(reference);
    const parsed = roomStateChangeSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Room request is invalid");
    try {
      await this.enquiries.changeState(
        reference,
        parsed.data.state,
        this.actor(request),
      );
      return { status: "ok" };
    } catch (error) {
      throw this.translate(error);
    }
  }

  @Post("enquiries/:reference/extension")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({
    description: "Bounded, reasoned retention extension recorded.",
  })
  async extend(
    @Param("reference") reference: string,
    @Body() body: unknown,
    @Headers("origin") origin: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoomReceipt> {
    this.assertOrigin(origin);
    this.assertReference(reference);
    const parsed = roomExtensionSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Room request is invalid");
    try {
      return await this.enquiries.extend(
        reference,
        parsed.data,
        this.actor(request),
      );
    } catch (error) {
      throw this.translate(error);
    }
  }

  @Get("designation")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ description: "Current Room designation state." })
  async designation(): Promise<RoomDesignationState> {
    return this.designations.current();
  }

  /**
   * Only the Principal designates. A designate cannot delegate onward, which is
   * what keeps the recipient count at two.
   */
  @Post("designation")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ description: "Room designation granted." })
  async grant(
    @Body() body: unknown,
    @Headers("origin") origin: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoomDesignationState> {
    this.assertOrigin(origin);
    this.assertPrincipal(request);
    const parsed = roomDesignationSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Room request is invalid");
    try {
      return await this.designations.grant(
        {
          userId: parsed.data.userId,
          expiresAt: new Date(parsed.data.expiresAt),
        },
        this.actor(request),
      );
    } catch (error) {
      if (error instanceof RoomDesignationRejectedError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete("designation")
  @Header("Cache-Control", "private, no-store")
  @ApiOkResponse({ description: "Room designation revoked." })
  async revoke(
    @Headers("origin") origin: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoomDesignationState> {
    this.assertOrigin(origin);
    this.assertPrincipal(request);
    return this.designations.revoke(this.actor(request));
  }

  private actor(request: AuthenticatedRequest): string {
    return request.auth.subject;
  }

  private assertPrincipal(request: AuthenticatedRequest): void {
    if (!hasPermission(request.auth.roles, "room:access")) {
      // An active designate reaches the guard but not this route.
      throw new ForbiddenException("Room access is not permitted");
    }
  }

  private assertOrigin(origin: string | undefined): void {
    try {
      assertTrustedMutationOrigin(
        origin ?? null,
        this.configuration.getOrThrow<string>("ADMIN_ORIGIN"),
      );
    } catch {
      throw new ForbiddenException("Room access is not permitted");
    }
  }

  /** Rejects a malformed reference before it reaches a query. */
  private assertReference(reference: string): void {
    if (!roomReceiptSchema.shape.reference.safeParse(reference).success) {
      throw new NotFoundException("Room enquiry was not found");
    }
  }

  private translate(error: unknown): Error {
    if (error instanceof RoomEnquiryNotFoundError) {
      return new NotFoundException("Room enquiry was not found");
    }
    return error instanceof Error ? error : new Error("Room request failed");
  }
}
