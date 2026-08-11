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
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AuthService } from "../application/auth.service";
import {
  assertTrustedMutationOrigin,
  csrfCookieName,
  csrfCookiePolicy,
  refreshCookieName,
  refreshCookiePolicy,
} from "../application/request-security";
import {
  AdministratorStatusDto,
  administratorStatusSchema,
  AdministratorInvitationDto,
  administratorInvitationSchema,
  InvitationAcceptanceDto,
  InvitationAcceptanceResponseDto,
  invitationAcceptanceSchema,
  InvitationSetupDto,
  invitationSetupSchema,
  LoginDto,
  loginInputSchema,
  StepUpDto,
  StepUpResponseDto,
  stepUpSchema,
  RolesUpdateDto,
  rolesUpdateSchema,
  authenticationAuditQuerySchema,
  HardwareKeyAuthenticationDto,
  HardwareKeyRegistrationDto,
  hardwareKeyAuthenticationSchema,
  hardwareKeyRegistrationSchema,
} from "./auth.dto";
import type { AuthenticatedSession } from "../application/auth.service";
import { AccessTokenGuard } from "./access-token.guard";
import type { AuthenticatedRequest } from "./authenticated-request";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import type {
  AdministratorSummary,
  AuthenticationAuditPage,
  AuthenticationAuditIntegrity,
} from "../persistence/auth.repository";
import type { MfaEncryptionStatus } from "@amanor/contracts";
import type { AuthenticationMethod } from "../domain/authentication-method";
import { HardwareKeyService } from "../application/hardware-key.service";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

type AuthCookies = Partial<
  Record<typeof refreshCookieName | typeof csrfCookieName, string>
>;
type SessionResponse = Readonly<{
  accessToken: string;
  expiresIn: number;
  user: AuthenticatedSession["user"];
}>;
type LoginResponse = SessionResponse & Readonly<{ csrfToken: string }>;
type SessionListItem = Readonly<{
  sessionId: string;
  familyId: string;
  authenticationMethods: readonly AuthenticationMethod[];
  createdAt: Date;
  rotatedAt?: Date;
  expiresAt: Date;
  revokedAt?: Date;
  current: boolean;
}>;

@ApiTags("authentication")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(ConfigService)
    private readonly configuration: ConfigService,
    @Inject(HardwareKeyService)
    private readonly hardwareKeys: HardwareKeyService,
  ) {}

  @Post("hardware-keys/registration/options")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  async hardwareKeyRegistrationOptions(
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<unknown> {
    this.assertOrigin(origin);
    return this.hardwareKeys.registrationOptions(request.auth);
  }

  @Post("hardware-keys/registration/verify")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  async hardwareKeyRegistrationVerify(
    @Body() input: HardwareKeyRegistrationDto,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<unknown> {
    this.assertOrigin(origin);
    const parsed = hardwareKeyRegistrationSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        "Hardware-key registration response is invalid",
      );
    return this.hardwareKeys.verifyRegistration(
      request.auth,
      parsed.data.ceremonyId,
      parsed.data.response as unknown as RegistrationResponseJSON,
      parsed.data.label,
    );
  }

  @Post("hardware-keys/authentication/options")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  async hardwareKeyAuthenticationOptions(
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<unknown> {
    this.assertOrigin(origin);
    return this.hardwareKeys.authenticationOptions(request.auth);
  }

  @Post("hardware-keys/authentication/verify")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  async hardwareKeyAuthenticationVerify(
    @Body() input: HardwareKeyAuthenticationDto,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<unknown> {
    this.assertOrigin(origin);
    const parsed = hardwareKeyAuthenticationSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        "Hardware-key authentication response is invalid",
      );
    return this.hardwareKeys.verifyAuthentication(
      request.auth,
      parsed.data.ceremonyId,
      parsed.data.response as unknown as AuthenticationResponseJSON,
    );
  }

  @Get("hardware-keys")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  async hardwareKeyList(
    @Req() request: AuthenticatedRequest,
  ): Promise<readonly unknown[]> {
    return this.hardwareKeys.list(request.auth);
  }

  @Delete("hardware-keys/:credentialId")
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  async hardwareKeyRevoke(
    @Param("credentialId") credentialId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin?: string,
  ): Promise<void> {
    this.assertOrigin(origin);
    if (!/^[A-Za-z0-9_-]{1,1024}$/u.test(credentialId))
      throw new BadRequestException("Hardware-key identifier is invalid");
    await this.hardwareKeys.revoke(request.auth, credentialId);
  }

  @Post("login")
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(200)
  @ApiOkResponse({ description: "Password and MFA verified; session created." })
  @ApiUnauthorizedResponse({
    description: "Credentials or MFA verification failed.",
  })
  async login(
    @Body() input: LoginDto,
    @Headers("origin") origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    this.assertOrigin(origin);
    const parsed = loginInputSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException("Login request is invalid");
    const result = await this.auth.login(
      parsed.data.email,
      parsed.data.password,
      {
        ...(parsed.data.mfaCode ? { mfaCode: parsed.data.mfaCode } : {}),
        ...(parsed.data.recoveryCode
          ? { recoveryCode: parsed.data.recoveryCode }
          : {}),
      },
    );
    response.cookie(
      refreshCookieName,
      result.refreshToken,
      refreshCookiePolicy,
    );
    response.cookie(csrfCookieName, result.csrfToken, csrfCookiePolicy);
    return {
      accessToken: result.accessToken,
      csrfToken: result.csrfToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Post("refresh")
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(200)
  @ApiOkResponse({
    description: "Refresh token rotated and new access token issued.",
  })
  @ApiUnauthorizedResponse({
    description: "Session, origin or CSRF proof is invalid.",
  })
  async refresh(
    @Req() request: Request,
    @Headers("origin") origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    this.assertOrigin(origin);
    const cookies = request.cookies as AuthCookies | undefined;
    const refreshToken = cookies?.[refreshCookieName] ?? "";
    const csrfCookie = cookies?.[csrfCookieName] ?? null;
    const csrfHeader = request.header("X-CSRF-Token") ?? null;
    const result = await this.auth.refresh(
      refreshToken,
      csrfCookie,
      csrfHeader,
    );
    response.cookie(
      refreshCookieName,
      result.refreshToken,
      refreshCookiePolicy,
    );
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Post("logout")
  @HttpCode(204)
  @ApiNoContentResponse({
    description: "Current refresh-token family revoked.",
  })
  async logout(
    @Req() request: Request,
    @Headers("origin") origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.assertOrigin(origin);
    const cookies = request.cookies as AuthCookies | undefined;
    await this.auth.logout(
      cookies?.[refreshCookieName] ?? "",
      cookies?.[csrfCookieName] ?? null,
      request.header("X-CSRF-Token") ?? null,
    );
    response.clearCookie(refreshCookieName, refreshCookiePolicy);
    response.clearCookie(csrfCookieName, csrfCookiePolicy);
  }

  @Get("sessions")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    description: "Sessions belonging to the authenticated administrator.",
  })
  async sessions(
    @Req() request: AuthenticatedRequest,
  ): Promise<readonly SessionListItem[]> {
    const sessions = await this.auth.listSessions(request.auth.subject);
    return sessions.map((session) => ({
      ...session,
      current: session.sessionId === request.auth.sessionId,
    }));
  }

  @Delete("sessions/:sessionId")
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiNoContentResponse({
    description: "The selected session family was revoked.",
  })
  async revokeSession(
    @Param("sessionId") sessionId: string,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin: string | undefined,
  ): Promise<void> {
    this.assertOrigin(origin);
    if (!sessionId || sessionId.length > 128)
      throw new BadRequestException("Session identifier is invalid");
    if (!(await this.auth.revokeSession(request.auth.subject, sessionId))) {
      throw new NotFoundException("Session was not found");
    }
  }

  @Get("users")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: "Minimal administrator account inventory." })
  async users(
    @Req() request: AuthenticatedRequest,
  ): Promise<readonly AdministratorSummary[]> {
    return this.auth.listAdministrators(request.auth.roles);
  }

  @Get("audit")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    description: "Redacted, cursor-paginated authentication security events.",
  })
  async authenticationAudit(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ): Promise<AuthenticationAuditPage> {
    const parsed = authenticationAuditQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException("Authentication audit query is invalid");
    return this.auth.listAuthenticationAudit(
      request.auth.roles,
      parsed.data.limit,
      parsed.data.cursor,
    );
  }

  @Get("audit/integrity")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    description: "Authentication audit hash-chain integrity status.",
  })
  async authenticationAuditIntegrity(
    @Req() request: AuthenticatedRequest,
  ): Promise<AuthenticationAuditIntegrity> {
    return this.auth.verifyAuthenticationAudit(request.auth.roles);
  }

  @Get("mfa/encryption-status")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      "Aggregate MFA ciphertext migration status without administrator identities or ciphertext.",
  })
  async mfaEncryptionStatus(
    @Req() request: AuthenticatedRequest,
  ): Promise<MfaEncryptionStatus> {
    return this.auth.mfaEncryptionStatus(request.auth.roles);
  }

  @Post("invitations")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: "One-time administrator invitation created." })
  async invite(
    @Body() input: AdministratorInvitationDto,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin: string | undefined,
  ): Promise<
    Readonly<{
      administrator: AdministratorSummary;
      invitationToken: string;
    }>
  > {
    this.assertOrigin(origin);
    this.assertRecentStepUp(request);
    const parsed = administratorInvitationSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException("Administrator invitation is invalid");
    return this.auth.inviteAdministrator(
      request.auth.subject,
      request.auth.roles,
      parsed.data.email,
      parsed.data.roles,
    );
  }

  @Post("invitations/setup")
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(200)
  @ApiOkResponse({ description: "Valid invitation MFA enrollment details." })
  async invitationSetup(
    @Body() input: InvitationSetupDto,
    @Headers("origin") origin: string | undefined,
  ): Promise<
    Readonly<{ email: string; enrollmentUri: string; expiresAt: Date }>
  > {
    this.assertOrigin(origin);
    const parsed = invitationSetupSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException("Invitation is invalid or expired");
    return this.auth.invitationSetup(parsed.data.token);
  }

  @Post("invitations/accept")
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(200)
  @ApiOkResponse({
    description:
      "Password and MFA enrollment accepted; recovery codes shown once.",
    type: InvitationAcceptanceResponseDto,
  })
  async acceptInvitation(
    @Body() input: InvitationAcceptanceDto,
    @Headers("origin") origin: string | undefined,
  ): Promise<Readonly<{ recoveryCodes: readonly string[] }>> {
    this.assertOrigin(origin);
    const parsed = invitationAcceptanceSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException("Invitation setup could not be completed");
    return this.auth.acceptInvitation(
      parsed.data.token,
      parsed.data.password,
      parsed.data.mfaCode,
    );
  }

  @Post("step-up")
  @UseGuards(AccessTokenGuard, AuthRateLimitGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOkResponse({
    description: "Recent MFA verified and elevated access token issued.",
    type: StepUpResponseDto,
  })
  async stepUp(
    @Body() input: StepUpDto,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin: string | undefined,
  ): Promise<Readonly<{ accessToken: string; expiresIn: 300 }>> {
    this.assertOrigin(origin);
    const parsed = stepUpSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Verification failed");
    return this.auth.stepUp(request.auth, parsed.data.mfaCode);
  }

  @Post("recovery-codes/rotate")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOkResponse({
    description: "Prior recovery codes replaced and new codes shown once.",
    type: InvitationAcceptanceResponseDto,
  })
  async rotateRecoveryCodes(
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin: string | undefined,
  ): Promise<Readonly<{ recoveryCodes: readonly string[] }>> {
    this.assertOrigin(origin);
    this.assertRecentStepUp(request);
    return this.auth.rotateRecoveryCodes(
      request.auth.subject,
      request.auth.sessionId,
    );
  }

  @Patch("users/:userId/roles")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    description: "Roles replaced and all subject sessions invalidated.",
  })
  async changeRoles(
    @Param("userId") userId: string,
    @Body() input: RolesUpdateDto,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin: string | undefined,
  ): Promise<AdministratorSummary> {
    this.assertOrigin(origin);
    this.assertRecentStepUp(request);
    const parsed = rolesUpdateSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException("Role assignment is invalid");
    return this.auth.changeRoles(
      request.auth.subject,
      request.auth.roles,
      this.userId(userId),
      parsed.data.roles,
    );
  }

  @Patch("users/:userId/status")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      "Administrator status changed and all subject sessions invalidated.",
  })
  async setStatus(
    @Param("userId") userId: string,
    @Body() input: AdministratorStatusDto,
    @Req() request: AuthenticatedRequest,
    @Headers("origin") origin: string | undefined,
  ): Promise<AdministratorSummary> {
    this.assertOrigin(origin);
    this.assertRecentStepUp(request);
    const parsed = administratorStatusSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException("Administrator status is invalid");
    return this.auth.setAdministratorDisabled(
      request.auth.subject,
      request.auth.roles,
      this.userId(userId),
      parsed.data.disabled,
    );
  }

  private userId(value: string): string {
    if (!value || value.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(value))
      throw new BadRequestException("Administrator identifier is invalid");
    return value;
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

  private assertRecentStepUp(request: AuthenticatedRequest): void {
    const stepUpAt = request.auth.stepUpAt;
    const now = Math.floor(Date.now() / 1_000);
    if (
      !request.auth.authenticationMethods.includes("step_up") ||
      !stepUpAt ||
      stepUpAt > now + 5 ||
      now - stepUpAt > 5 * 60
    ) {
      throw new ForbiddenException("Recent MFA verification is required");
    }
  }
}
