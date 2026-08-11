import { createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { assertCsrfProof, csrfTokenHash } from "./request-security";
import { assertSafeSecurityEvent, type SecurityEvent } from "./security-event";
import {
  RefreshRotationConflictError,
  RefreshTokenReuseError,
  rotateSession,
} from "./rotate-session";
import {
  decryptMfaSecretWithKeys,
  encryptMfaSecret,
  type EncryptedMfaSecret,
  generateMfaSecret,
  matchedTotpStep,
  totpEnrollmentUri,
} from "../domain/mfa";
import { hashPassword, verifyPassword } from "../domain/password";
import { createRefreshToken } from "../domain/refresh-token";
import { newSessionIdentity, type Session } from "../domain/session";
import {
  AuthRepository,
  type AdministratorSummary,
  type AuthenticationAuditPage,
  type AuthenticationAuditIntegrity,
  type AuthUser,
  type SessionSummary,
} from "../persistence/auth.repository";
import { hasPermission, type Role } from "../domain/roles";
import { JwtKeyService } from "./jwt-key.service";
import { sessionPeppers } from "./session-peppers";
import { mfaEncryptionKeys } from "./mfa-encryption-keys";
import type { MfaEncryptionStatus } from "@amanor/contracts";
import type { AuthenticationMethod } from "../domain/authentication-method";

const dummyPasswordHash =
  "$2b$12$XAI/KCYwpDExO1PqegR9duQ.RT.bZ/SKvyn1SNxNOeXD0LcAjdiMq";
const sessionLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1_000;
const invitationLifetimeMilliseconds = 24 * 60 * 60 * 1_000;
const recoveryCodeCount = 8;

export type AuthenticatedSession = Readonly<{
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresIn: number;
  user: Readonly<{ id: string; roles: AuthUser["roles"] }>;
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly jwtKeys: JwtKeyService,
    private readonly configuration: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    verificationInput:
      | string
      | Readonly<{ mfaCode?: string; recoveryCode?: string }>,
    now = new Date(),
  ): Promise<AuthenticatedSession> {
    const canonicalEmail = email.trim().toLowerCase();
    const user = await this.repository.findUserByEmail(canonicalEmail);
    const passwordValid = await verifyPassword(
      password,
      user?.passwordHash ?? dummyPasswordHash,
    );
    if (
      !user ||
      !passwordValid ||
      user.disabledAt ||
      !user.mfa?.encryptedSecret
    ) {
      await this.recordEvent(
        "login_failed",
        user?.userId,
        undefined,
        "invalid_credentials",
        "failure",
        now,
      );
      throw new UnauthorizedException(
        "Invalid credentials or verification code",
      );
    }

    const verification =
      typeof verificationInput === "string"
        ? { mfaCode: verificationInput }
        : verificationInput;
    let authenticationMethods: readonly AuthenticationMethod[] = [
      "pwd",
      "totp",
    ];
    if (verification.mfaCode) {
      const encryptedMfa = this.encryptedMfa(user);
      const decryptedMfa = decryptMfaSecretWithKeys(
        encryptedMfa,
        mfaEncryptionKeys(this.configuration),
      );
      const matchedStep = matchedTotpStep(
        decryptedMfa.secret,
        verification.mfaCode,
        now,
      );
      if (
        matchedStep === null ||
        !(await this.repository.consumeMfaStep(user.userId, matchedStep))
      ) {
        await this.failedVerification(user.userId, now);
      }
      await this.migrateMfaEncryption(user.userId, encryptedMfa, decryptedMfa);
      authenticationMethods = ["pwd", "totp"];
    } else if (
      verification.recoveryCode &&
      (await this.repository.recoverWithCode({
        userId: user.userId,
        candidateHashes: sessionPeppers(this.configuration).map((pepper) =>
          this.recoveryCodeHash(verification.recoveryCode!, pepper),
        ),
        emailCanonical: user.emailCanonical,
        notificationId: randomUUID(),
        occurredAt: now,
      }))
    ) {
      await this.recordEvent(
        "mfa_recovered",
        user.userId,
        undefined,
        "single_use_recovery",
        "success",
        now,
      );
      authenticationMethods = ["pwd", "recovery"];
    } else {
      await this.failedVerification(user.userId, now);
    }

    const identity = newSessionIdentity();
    const pepper = sessionPeppers(this.configuration)[0];
    const refresh = createRefreshToken(pepper, identity.sessionId);
    const csrfToken = randomBytes(32).toString("base64url");
    const session: Session = {
      ...identity,
      userId: user.userId,
      roles: user.roles,
      roleVersion: user.roleVersion,
      currentRefreshHash: refresh.hash,
      csrfHash: csrfTokenHash(csrfToken),
      authenticationMethods,
      expiresAt: new Date(now.getTime() + sessionLifetimeMilliseconds),
    };
    await this.repository.createSession(session);
    const accessToken = await this.jwtKeys.sign({
      subject: user.userId,
      sessionId: session.sessionId,
      roles: session.roles,
      roleVersion: session.roleVersion,
      authenticationMethods: session.authenticationMethods,
    });
    await this.recordEvent(
      "login_succeeded",
      user.userId,
      session.sessionId,
      undefined,
      "success",
      now,
    );
    return {
      accessToken,
      refreshToken: refresh.raw,
      csrfToken,
      expiresIn: 300,
      user: { id: user.userId, roles: user.roles },
    };
  }

  async refresh(
    rawRefreshToken: string,
    csrfCookie: string | null,
    csrfHeader: string | null,
    now = new Date(),
  ): Promise<Omit<AuthenticatedSession, "csrfToken">> {
    const sessionId = rawRefreshToken.split(".")[0];
    if (!sessionId)
      throw new UnauthorizedException("Session is invalid or expired");
    const existing = await this.repository.findBySessionId(sessionId);
    if (!existing)
      throw new UnauthorizedException("Session is invalid or expired");
    try {
      assertCsrfProof(csrfCookie, csrfHeader, existing.csrfHash);
    } catch {
      throw new UnauthorizedException("Session is invalid or expired");
    }

    try {
      const rotated = await rotateSession(
        this.repository,
        rawRefreshToken,
        sessionPeppers(this.configuration),
        now,
      );
      const accessToken = await this.jwtKeys.sign({
        subject: rotated.session.userId,
        sessionId: rotated.session.sessionId,
        roles: rotated.session.roles,
        roleVersion: rotated.session.roleVersion,
        authenticationMethods: rotated.session.authenticationMethods,
      });
      await this.recordEvent(
        "session_refreshed",
        rotated.session.userId,
        rotated.session.sessionId,
        undefined,
        "success",
        now,
      );
      return {
        accessToken,
        refreshToken: rotated.refreshToken,
        expiresIn: 300,
        user: { id: rotated.session.userId, roles: rotated.session.roles },
      };
    } catch (error) {
      if (
        error instanceof RefreshTokenReuseError ||
        error instanceof RefreshRotationConflictError
      ) {
        await this.recordEvent(
          "refresh_token_reuse",
          existing.userId,
          existing.sessionId,
          error instanceof RefreshTokenReuseError
            ? "reused_consumed_token"
            : "rotation_race",
          "failure",
          now,
        );
      }
      throw new UnauthorizedException("Session is invalid or expired");
    }
  }

  async logout(
    rawRefreshToken: string,
    csrfCookie: string | null,
    csrfHeader: string | null,
    now = new Date(),
  ): Promise<void> {
    const sessionId = rawRefreshToken.split(".")[0];
    const session = sessionId
      ? await this.repository.findBySessionId(sessionId)
      : null;
    if (!session) return;
    try {
      assertCsrfProof(csrfCookie, csrfHeader, session.csrfHash);
    } catch {
      throw new UnauthorizedException("Session is invalid or expired");
    }
    await this.repository.revokeFamily(session.familyId, "logout", now);
    await this.recordEvent(
      "session_revoked",
      session.userId,
      session.sessionId,
      "logout",
      "success",
      now,
    );
  }

  async listSessions(userId: string): Promise<readonly SessionSummary[]> {
    return this.repository.listSessionsForUser(userId);
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<boolean> {
    const revoked = await this.repository.revokeUserSession(
      userId,
      sessionId,
      "user_revoked",
      now,
    );
    if (revoked)
      await this.recordEvent(
        "session_revoked",
        userId,
        sessionId,
        "user_revoked",
        "success",
        now,
      );
    return revoked;
  }

  async listAdministrators(
    actorRoles: readonly Role[],
  ): Promise<readonly AdministratorSummary[]> {
    this.assertSecurityManager(actorRoles);
    return this.repository.listUsers();
  }

  async listAuthenticationAudit(
    actorRoles: readonly Role[],
    limit: number,
    cursor?: string,
  ): Promise<AuthenticationAuditPage> {
    this.assertSecurityManager(actorRoles);
    return this.repository.listEvents(limit, cursor);
  }

  async verifyAuthenticationAudit(
    actorRoles: readonly Role[],
  ): Promise<AuthenticationAuditIntegrity> {
    this.assertSecurityManager(actorRoles);
    return this.repository.verifyEventChain();
  }

  async mfaEncryptionStatus(
    actorRoles: readonly Role[],
    now = new Date(),
  ): Promise<MfaEncryptionStatus> {
    this.assertSecurityManager(actorRoles);
    const maximumRecords = 1_000;
    const records = await this.repository.listMfaCiphertexts(
      maximumRecords + 1,
    );
    const checkedRecords = records.slice(0, maximumRecords);
    const keys = mfaEncryptionKeys(this.configuration);
    let activeKeyRecords = 0;
    let retiringKeyRecords = 0;
    let unreadableRecords = 0;
    for (const record of checkedRecords) {
      try {
        const decrypted = decryptMfaSecretWithKeys(record, keys);
        if (decrypted.keyIndex === 0) activeKeyRecords += 1;
        else retiringKeyRecords += 1;
      } catch {
        unreadableRecords += 1;
      }
    }
    const truncated = records.length > maximumRecords;
    return {
      checkedAt: now,
      checkedRecords: checkedRecords.length,
      activeKeyRecords,
      retiringKeyRecords,
      unreadableRecords,
      configuredRetiringKeys: keys.length - 1,
      truncated,
      safeToRetire:
        !truncated && retiringKeyRecords === 0 && unreadableRecords === 0,
    };
  }

  async inviteAdministrator(
    actorId: string,
    actorRoles: readonly Role[],
    email: string,
    roles: readonly Role[],
    now = new Date(),
  ): Promise<
    Readonly<{ administrator: AdministratorSummary; invitationToken: string }>
  > {
    this.assertSecurityManager(actorRoles);
    const emailCanonical = email.trim().toLowerCase();
    if (await this.repository.findUserByEmail(emailCanonical))
      throw new ConflictException(
        "An administrator already uses this email address",
      );
    const uniqueRoles = [...new Set(roles)];
    if (uniqueRoles.length === 0)
      throw new BadRequestException("At least one role is required");
    if (uniqueRoles.includes("principal"))
      throw new ForbiddenException(
        "Principal invitations require the break-glass procedure",
      );
    const invitationToken = randomBytes(32).toString("base64url");
    const secret = generateMfaSecret();
    const administrator = await this.repository.createInvitedUser({
      userId: randomUUID(),
      emailCanonical,
      passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
      roles: uniqueRoles,
      invitationTokenHash: this.invitationHash(invitationToken),
      invitationExpiresAt: new Date(
        now.getTime() + invitationLifetimeMilliseconds,
      ),
      invitedAt: now,
      invitedBy: actorId,
      mfa: encryptMfaSecret(
        secret,
        this.configuration.getOrThrow<string>("MFA_ENCRYPTION_KEY"),
      ),
    });
    await this.recordEvent(
      "user_invited",
      administrator.userId,
      undefined,
      "administrative_invitation",
      "success",
      now,
      actorId,
    );
    return { administrator, invitationToken };
  }

  async invitationSetup(
    token: string,
    now = new Date(),
  ): Promise<
    Readonly<{ email: string; enrollmentUri: string; expiresAt: Date }>
  > {
    const { invitation } = await this.validInvitation(token, now);
    const encryptedMfa = this.encryptedMfa(invitation);
    const decryptedMfa = decryptMfaSecretWithKeys(
      encryptedMfa,
      mfaEncryptionKeys(this.configuration),
    );
    await this.migrateMfaEncryption(
      invitation.userId,
      encryptedMfa,
      decryptedMfa,
    );
    return {
      email: invitation.emailCanonical,
      enrollmentUri: totpEnrollmentUri(
        decryptedMfa.secret,
        invitation.emailCanonical,
      ),
      expiresAt: invitation.invitationExpiresAt!,
    };
  }

  async acceptInvitation(
    token: string,
    password: string,
    mfaCode: string,
    now = new Date(),
  ): Promise<Readonly<{ recoveryCodes: readonly string[] }>> {
    const { invitation, invitationTokenHash } = await this.validInvitation(
      token,
      now,
    );
    const encryptedMfa = this.encryptedMfa(invitation);
    const decryptedMfa = decryptMfaSecretWithKeys(
      encryptedMfa,
      mfaEncryptionKeys(this.configuration),
    );
    const matchedMfaStep = matchedTotpStep(decryptedMfa.secret, mfaCode, now);
    if (matchedMfaStep === null)
      throw new BadRequestException("Invitation setup could not be completed");
    await this.migrateMfaEncryption(
      invitation.userId,
      encryptedMfa,
      decryptedMfa,
    );
    const recoveryCodes = Array.from({ length: recoveryCodeCount }, () =>
      this.generateRecoveryCode(),
    );
    const accepted = await this.repository.acceptInvitation({
      userId: invitation.userId,
      invitationTokenHash,
      passwordHash: await hashPassword(password),
      matchedMfaStep,
      recoveryCodeHashes: recoveryCodes.map((code) =>
        this.recoveryCodeHash(code),
      ),
      acceptedAt: now,
    });
    if (!accepted)
      throw new ConflictException("Invitation setup could not be completed");
    await this.recordEvent(
      "invitation_accepted",
      invitation.userId,
      undefined,
      "administrator_onboarding",
      "success",
      now,
    );
    return { recoveryCodes };
  }

  async stepUp(
    claims: Readonly<{
      subject: string;
      sessionId: string;
      roles: readonly Role[];
      roleVersion: number;
      authenticationMethods: readonly AuthenticationMethod[];
    }>,
    mfaCode: string,
    now = new Date(),
  ): Promise<Readonly<{ accessToken: string; expiresIn: 300 }>> {
    const user = await this.repository.findUserMfaById(claims.subject);
    if (!user || user.disabledAt || !user.mfa?.encryptedSecret)
      throw new UnauthorizedException("Verification failed");
    const encryptedMfa = this.encryptedMfa(user);
    const decryptedMfa = decryptMfaSecretWithKeys(
      encryptedMfa,
      mfaEncryptionKeys(this.configuration),
    );
    const matchedStep = matchedTotpStep(decryptedMfa.secret, mfaCode, now);
    if (
      matchedStep === null ||
      !(await this.repository.consumeMfaStep(user.userId, matchedStep))
    ) {
      await this.recordEvent(
        "mfa_challenged",
        user.userId,
        claims.sessionId,
        "invalid_or_replayed_mfa",
        "failure",
        now,
      );
      throw new UnauthorizedException("Verification failed");
    }
    await this.migrateMfaEncryption(user.userId, encryptedMfa, decryptedMfa);
    const accessToken = await this.jwtKeys.sign({
      subject: claims.subject,
      sessionId: claims.sessionId,
      roles: claims.roles,
      roleVersion: claims.roleVersion,
      authenticationMethods: Array.from(
        new Set<AuthenticationMethod>([
          ...claims.authenticationMethods,
          "step_up",
        ]),
      ),
      stepUpAt: Math.floor(now.getTime() / 1_000),
    });
    await this.recordEvent(
      "mfa_challenged",
      user.userId,
      claims.sessionId,
      "recent_mfa_step_up",
      "success",
      now,
    );
    return { accessToken, expiresIn: 300 };
  }

  async findActiveUserForHardwareKey(userId: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || user.disabledAt)
      throw new UnauthorizedException("Administrator is unavailable");
    return user;
  }

  async rotateRecoveryCodes(
    userId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<Readonly<{ recoveryCodes: readonly string[] }>> {
    const user = await this.subject(userId);
    const recoveryCodes = Array.from({ length: recoveryCodeCount }, () =>
      this.generateRecoveryCode(),
    );
    if (
      !(await this.repository.replaceRecoveryCodesAndNotify({
        userId,
        emailCanonical: user.emailCanonical,
        recoveryCodeHashes: recoveryCodes.map((code) =>
          this.recoveryCodeHash(code),
        ),
        notificationId: randomUUID(),
        occurredAt: now,
      }))
    ) {
      throw new UnauthorizedException("Recovery codes could not be rotated");
    }
    await this.recordEvent(
      "recovery_codes_rotated",
      userId,
      sessionId,
      "administrator_self_service",
      "success",
      now,
    );
    return { recoveryCodes };
  }

  async changeRoles(
    actorId: string,
    actorRoles: readonly Role[],
    subjectId: string,
    roles: readonly Role[],
    now = new Date(),
  ): Promise<AdministratorSummary> {
    this.assertSecurityManager(actorRoles);
    if (actorId === subjectId)
      throw new BadRequestException(
        "Administrators cannot change their own roles",
      );
    const subject = await this.subject(subjectId);
    if (subject.roles.includes("principal") && !roles.includes("principal"))
      throw new ForbiddenException(
        "Principal role removal requires the break-glass procedure",
      );
    const uniqueRoles = [...new Set(roles)];
    if (uniqueRoles.length === 0)
      throw new BadRequestException("At least one role is required");
    if (
      !(await this.repository.updateUserRoles(
        subjectId,
        subject.roleVersion,
        uniqueRoles,
      ))
    )
      throw new ConflictException("The administrator changed concurrently");
    await this.repository.revokeSessionsForUser(
      subjectId,
      "roles_changed",
      now,
    );
    await this.recordEvent(
      "role_changed",
      subjectId,
      undefined,
      "administrative_change",
      "success",
      now,
      actorId,
    );
    return {
      ...this.summary(subject),
      roles: uniqueRoles,
      roleVersion: subject.roleVersion + 1,
    };
  }

  async setAdministratorDisabled(
    actorId: string,
    actorRoles: readonly Role[],
    subjectId: string,
    disabled: boolean,
    now = new Date(),
  ): Promise<AdministratorSummary> {
    this.assertSecurityManager(actorRoles);
    if (actorId === subjectId)
      throw new BadRequestException("Administrators cannot disable themselves");
    const subject = await this.subject(subjectId);
    if (subject.roles.includes("principal") && disabled)
      throw new ForbiddenException(
        "Principal disablement requires the break-glass procedure",
      );
    if (Boolean(subject.disabledAt) === disabled) return this.summary(subject);
    if (
      !(await this.repository.setUserDisabled(
        subjectId,
        subject.roleVersion,
        disabled,
        now,
      ))
    )
      throw new ConflictException("The administrator changed concurrently");
    await this.repository.revokeSessionsForUser(
      subjectId,
      disabled ? "user_disabled" : "user_enabled",
      now,
    );
    await this.recordEvent(
      disabled ? "user_disabled" : "user_enabled",
      subjectId,
      undefined,
      "administrative_change",
      "success",
      now,
      actorId,
    );
    const updated = {
      userId: subject.userId,
      emailCanonical: subject.emailCanonical,
      roles: subject.roles,
      roleVersion: subject.roleVersion + 1,
    };
    return disabled ? { ...updated, disabledAt: now } : updated;
  }

  private assertSecurityManager(roles: readonly Role[]): void {
    if (!hasPermission(roles, "security:manage"))
      throw new ForbiddenException(
        "Security management permission is required",
      );
  }

  private encryptedMfa(user: AuthUser): EncryptedMfaSecret {
    if (!user.mfa?.encryptedSecret)
      throw new Error("MFA secret is not enrolled");
    return {
      encryptedSecret: user.mfa.encryptedSecret,
      iv: user.mfa.iv,
      authTag: user.mfa.authTag,
    };
  }

  private async migrateMfaEncryption(
    userId: string,
    expected: EncryptedMfaSecret,
    decrypted: Readonly<{ secret: string; keyIndex: number }>,
  ): Promise<void> {
    if (decrypted.keyIndex === 0) return;
    const migrated = await this.repository.rotateMfaEncryption({
      userId,
      expected,
      next: encryptMfaSecret(
        decrypted.secret,
        mfaEncryptionKeys(this.configuration)[0],
      ),
    });
    if (!migrated) throw new Error("MFA encryption migration conflicted");
  }

  private async subject(userId: string): Promise<AuthUser> {
    const subject = await this.repository.findUserById(userId);
    if (!subject) throw new NotFoundException("Administrator was not found");
    return subject;
  }

  private summary(user: AuthUser): AdministratorSummary {
    return {
      userId: user.userId,
      emailCanonical: user.emailCanonical,
      roles: user.roles,
      roleVersion: user.roleVersion,
      ...(user.disabledAt ? { disabledAt: user.disabledAt } : {}),
      ...(user.invitedAt ? { invitedAt: user.invitedAt } : {}),
      ...(user.invitationAcceptedAt
        ? { invitationAcceptedAt: user.invitationAcceptedAt }
        : {}),
    };
  }

  private invitationHash(
    token: string,
    pepper = sessionPeppers(this.configuration)[0],
  ): string {
    return createHmac("sha256", pepper)
      .update(`administrator-invitation:${token}`)
      .digest("base64url");
  }

  private generateRecoveryCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = randomBytes(16);
    const raw = Array.from(
      bytes,
      (byte) => alphabet[byte % alphabet.length],
    ).join("");
    return raw.match(/.{4}/gu)!.join("-");
  }

  private recoveryCodeHash(
    code: string,
    pepper = sessionPeppers(this.configuration)[0],
  ): string {
    return createHmac("sha256", pepper)
      .update(`administrator-recovery:${code}`)
      .digest("base64url");
  }

  private async failedVerification(userId: string, now: Date): Promise<never> {
    await this.recordEvent(
      "login_failed",
      userId,
      undefined,
      "invalid_or_replayed_mfa",
      "failure",
      now,
    );
    throw new UnauthorizedException("Invalid credentials or verification code");
  }

  private async validInvitation(
    token: string,
    now: Date,
  ): Promise<Readonly<{ invitation: AuthUser; invitationTokenHash: string }>> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token))
      throw new BadRequestException("Invitation is invalid or expired");
    let invitation: AuthUser | null = null;
    let invitationTokenHash = "";
    for (const pepper of sessionPeppers(this.configuration)) {
      invitationTokenHash = this.invitationHash(token, pepper);
      invitation =
        await this.repository.findInvitationByHash(invitationTokenHash);
      if (invitation) break;
    }
    if (
      !invitation ||
      invitation.invitationAcceptedAt ||
      !invitation.invitationExpiresAt ||
      invitation.invitationExpiresAt <= now ||
      !invitation.mfa?.encryptedSecret
    )
      throw new BadRequestException("Invitation is invalid or expired");
    return { invitation, invitationTokenHash };
  }

  private async recordEvent(
    type: SecurityEvent["type"],
    subjectId: string | undefined,
    sessionId: string | undefined,
    reason: string | undefined,
    outcome: SecurityEvent["outcome"],
    occurredAt: Date,
    actorId?: string,
  ): Promise<void> {
    const event: SecurityEvent = {
      eventId: randomUUID(),
      type,
      occurredAt,
      outcome,
      ...(subjectId ? { subjectId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(reason ? { reason } : {}),
    };
    assertSafeSecurityEvent(event);
    await this.repository.appendEvent(event);
  }

  async recordHardwareKeyEvent(
    type: Extract<
      SecurityEvent["type"],
      | "hardware_key_enrolled"
      | "hardware_key_authenticated"
      | "hardware_key_revoked"
    >,
    claims: Readonly<{ subject: string; sessionId: string }>,
    now: Date,
  ): Promise<void> {
    await this.recordEvent(
      type,
      claims.subject,
      claims.sessionId,
      "webauthn_user_verified",
      "success",
      now,
    );
  }
}
