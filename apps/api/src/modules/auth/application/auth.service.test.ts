import { createHmac, randomBytes } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateTotpForTesting,
  type EncryptedMfaSecret,
} from "../domain/mfa";
import { hashPassword } from "../domain/password";
import { createRefreshToken } from "../domain/refresh-token";
import type { Session } from "../domain/session";
import type { AuthRepository, AuthUser } from "../persistence/auth.repository";
import { csrfTokenHash } from "./request-security";
import { AuthService } from "./auth.service";
import type { JwtKeyService } from "./jwt-key.service";

const now = new Date("2026-08-09T18:00:00Z");
const pepper = "a-session-pepper-that-is-definitely-longer-than-32-bytes";
const mfaKey = randomBytes(32).toString("base64");
const mfaSecret = "JBSWY3DPEHPK3PXP";

async function fixture(
  overrides: Partial<AuthUser> = {},
  configurationOverrides: Record<string, string> = {},
) {
  const user: AuthUser = {
    userId: "user-1",
    emailCanonical: "editor@example.test",
    passwordHash: await hashPassword("a-long-development-passphrase"),
    roles: ["editor"],
    roleVersion: 1,
    mfa: { ...encryptMfaSecret(mfaSecret, mfaKey), enrolledAt: now },
    ...overrides,
  };
  const repository = {
    findUserByEmail: vi.fn().mockResolvedValue(user),
    findUserMfaById: vi.fn().mockResolvedValue(user),
    consumeMfaStep: vi.fn().mockResolvedValue(true),
    consumeRecoveryCode: vi.fn().mockResolvedValue(false),
    replaceRecoveryCodes: vi.fn().mockResolvedValue(true),
    recoverWithCode: vi.fn().mockResolvedValue(false),
    replaceRecoveryCodesAndNotify: vi.fn().mockResolvedValue(true),
    rotateMfaEncryption: vi.fn().mockResolvedValue(true),
    createSession: vi.fn().mockResolvedValue(undefined),
    findBySessionId: vi.fn(),
    wasRefreshHashConsumed: vi.fn().mockResolvedValue(false),
    rotate: vi.fn().mockResolvedValue(true),
    revokeFamily: vi.fn().mockResolvedValue(undefined),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    listSessionsForUser: vi.fn().mockResolvedValue([]),
    revokeUserSession: vi.fn().mockResolvedValue(true),
    listUsers: vi.fn().mockResolvedValue([]),
    listMfaCiphertexts: vi.fn().mockResolvedValue([]),
    updateUserRoles: vi.fn().mockResolvedValue(true),
    setUserDisabled: vi.fn().mockResolvedValue(true),
    revokeSessionsForUser: vi.fn().mockResolvedValue(undefined),
    findUserById: vi.fn().mockResolvedValue(user),
    createInvitedUser: vi.fn(),
    findInvitationByHash: vi.fn(),
    acceptInvitation: vi.fn().mockResolvedValue(true),
    listEvents: vi.fn().mockResolvedValue({ items: [] }),
    verifyEventChain: vi.fn().mockResolvedValue({
      status: "valid",
      checkedEvents: 0,
    }),
  };
  const keys = { sign: vi.fn().mockResolvedValue("signed-access-token") };
  const configuration = new ConfigService({
    SESSION_PEPPER: pepper,
    MFA_ENCRYPTION_KEY: mfaKey,
    ...configurationOverrides,
  });
  const service = new AuthService(
    repository as unknown as AuthRepository,
    keys as unknown as JwtKeyService,
    configuration,
  );
  return { service, repository, keys, user };
}

describe("AuthService", () => {
  it("requires password plus non-replayed MFA before creating a session", async () => {
    const { service, repository } = await fixture();
    const result = await service.login(
      "Editor@Example.Test",
      "a-long-development-passphrase",
      generateTotpForTesting(mfaSecret, now),
      now,
    );

    expect(result).toEqual(
      expect.objectContaining({
        accessToken: "signed-access-token",
        expiresIn: 300,
      }),
    );
    expect(repository.consumeMfaStep).toHaveBeenCalledOnce();
    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        authenticationMethods: ["pwd", "totp"],
      }),
    );
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "login_succeeded", outcome: "success" }),
    );
  });

  it("uses a uniform failure and creates no session for bad password, bad MFA or disabled users", async () => {
    const invalidPassword = await fixture();
    await expect(
      invalidPassword.service.login(
        "editor@example.test",
        "a-long-but-incorrect-passphrase",
        generateTotpForTesting(mfaSecret, now),
        now,
      ),
    ).rejects.toThrow("Invalid credentials or verification code");
    expect(invalidPassword.repository.createSession).not.toHaveBeenCalled();

    const replay = await fixture();
    replay.repository.consumeMfaStep.mockResolvedValue(false);
    await expect(
      replay.service.login(
        "editor@example.test",
        "a-long-development-passphrase",
        generateTotpForTesting(mfaSecret, now),
        now,
      ),
    ).rejects.toThrow("Invalid credentials or verification code");
    expect(replay.repository.createSession).not.toHaveBeenCalled();

    const disabled = await fixture({ disabledAt: now });
    await expect(
      disabled.service.login(
        "editor@example.test",
        "a-long-development-passphrase",
        generateTotpForTesting(mfaSecret, now),
        now,
      ),
    ).rejects.toThrow("Invalid credentials or verification code");
  });

  it("atomically consumes a recovery code, revokes prior sessions and marks the replacement session", async () => {
    const { service, repository } = await fixture();
    repository.recoverWithCode.mockResolvedValue(true);
    const result = await service.login(
      "editor@example.test",
      "a-long-development-passphrase",
      { recoveryCode: "ABCD-2345-EFGH-6789" },
      now,
    );

    expect(result.accessToken).toBe("signed-access-token");
    expect(repository.recoverWithCode).toHaveBeenCalledWith({
      userId: "user-1",
      candidateHashes: [expect.any(String)],
      emailCanonical: "editor@example.test",
      notificationId: expect.any(String),
      occurredAt: now,
    });
    expect(repository.revokeSessionsForUser).not.toHaveBeenCalled();
    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ authenticationMethods: ["pwd", "recovery"] }),
    );
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "mfa_recovered", outcome: "success" }),
    );
  });

  it("rejects a used or unknown recovery code without creating a session", async () => {
    const { service, repository } = await fixture();
    await expect(
      service.login(
        "editor@example.test",
        "a-long-development-passphrase",
        { recoveryCode: "ABCD-2345-EFGH-6789" },
        now,
      ),
    ).rejects.toThrow("Invalid credentials or verification code");
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it("issues a recent-MFA token only after consuming a fresh TOTP step", async () => {
    const { service, repository, keys } = await fixture();
    const result = await service.stepUp(
      {
        subject: "user-1",
        sessionId: "session-1",
        roles: ["security_admin"],
        roleVersion: 1,
        authenticationMethods: ["pwd", "totp"],
      },
      generateTotpForTesting(mfaSecret, now),
      now,
    );
    expect(result).toEqual({
      accessToken: "signed-access-token",
      expiresIn: 300,
    });
    expect(keys.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticationMethods: ["pwd", "totp", "step_up"],
        stepUpAt: Math.floor(now.getTime() / 1_000),
      }),
    );
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "mfa_challenged", outcome: "success" }),
    );
  });

  it("replaces all recovery codes after step-up without persisting plaintext", async () => {
    const { service, repository } = await fixture();
    const result = await service.rotateRecoveryCodes(
      "user-1",
      "session-1",
      now,
    );
    expect(result.recoveryCodes).toHaveLength(8);
    expect(repository.replaceRecoveryCodesAndNotify).toHaveBeenCalledWith({
      userId: "user-1",
      emailCanonical: "editor@example.test",
      recoveryCodeHashes: expect.arrayContaining([
        expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
      ]),
      notificationId: expect.any(String),
      occurredAt: now,
    });
    const persisted = repository.replaceRecoveryCodesAndNotify.mock
      .calls[0]?.[0] as { recoveryCodeHashes: readonly string[] } | undefined;
    expect(persisted?.recoveryCodeHashes).not.toEqual(
      expect.arrayContaining([...result.recoveryCodes]),
    );
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "recovery_codes_rotated",
        outcome: "success",
      }),
    );
  });

  it("returns eight one-time recovery codes only after invitation acceptance", async () => {
    const invitation = await fixture();
    invitation.repository.findInvitationByHash.mockResolvedValue({
      ...invitation.user,
      invitationTokenHash: "stored-invitation-hash",
      invitationExpiresAt: new Date(now.getTime() + 60_000),
    });
    const token = "a".repeat(43);
    const result = await invitation.service.acceptInvitation(
      token,
      "a-new-secure-administrator-password",
      generateTotpForTesting(mfaSecret, now),
      now,
    );
    expect(result.recoveryCodes).toHaveLength(8);
    expect(new Set(result.recoveryCodes).size).toBe(8);
    expect(
      result.recoveryCodes.every((code) =>
        /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/u.test(code),
      ),
    ).toBe(true);
    expect(invitation.repository.acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        recoveryCodeHashes: expect.arrayContaining([
          expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
        ]),
      }),
    );
  });

  it("migrates retiring-key MFA ciphertext only after successful login verification", async () => {
    const retiringMfaKey = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptMfaSecret(mfaSecret, retiringMfaKey);
    const { service, repository } = await fixture(
      { mfa: { ...encrypted, enrolledAt: now } },
      { MFA_RETIRING_ENCRYPTION_KEYS: JSON.stringify([retiringMfaKey]) },
    );
    let migrated: EncryptedMfaSecret | undefined;
    repository.rotateMfaEncryption.mockImplementation(
      (input: { next: EncryptedMfaSecret }) => {
        migrated = input.next;
        return Promise.resolve(true);
      },
    );

    await service.login(
      "editor@example.test",
      "a-long-development-passphrase",
      generateTotpForTesting(mfaSecret, now),
      now,
    );

    expect(repository.rotateMfaEncryption).toHaveBeenCalledWith({
      userId: "user-1",
      expected: encrypted,
      next: expect.objectContaining({
        encryptedSecret: expect.any(String),
        iv: expect.any(String),
        authTag: expect.any(String),
      }),
    });
    expect(migrated).toBeDefined();
    expect(decryptMfaSecret(migrated!, mfaKey)).toBe(mfaSecret);
  });

  it("rotates a valid refresh token only with matching CSRF proof", async () => {
    const { service, repository } = await fixture();
    const refresh = createRefreshToken(pepper);
    const csrf = "csrf-proof-value";
    const session: Session = {
      sessionId: refresh.sessionId,
      familyId: "family-1",
      userId: "user-1",
      roles: ["editor"],
      roleVersion: 1,
      currentRefreshHash: refresh.hash,
      csrfHash: csrfTokenHash(csrf),
      authenticationMethods: ["pwd", "totp"],
      expiresAt: new Date("2026-09-01T00:00:00Z"),
    };
    repository.findBySessionId.mockResolvedValue(session);

    await expect(
      service.refresh(refresh.raw, csrf, csrf, now),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: "signed-access-token",
        expiresIn: 300,
      }),
    );
    await expect(
      service.refresh(refresh.raw, csrf, "wrong", now),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it("lists and revokes only sessions owned by the authenticated user", async () => {
    const { service, repository } = await fixture();
    repository.listSessionsForUser.mockResolvedValue([
      { sessionId: "session-1" },
    ]);
    await expect(service.listSessions("user-1")).resolves.toEqual([
      { sessionId: "session-1" },
    ]);
    expect(repository.listSessionsForUser).toHaveBeenCalledWith("user-1");

    await expect(
      service.revokeSession("user-1", "session-1", now),
    ).resolves.toBe(true);
    expect(repository.revokeUserSession).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "user_revoked",
      now,
    );
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "session_revoked", subjectId: "user-1" }),
    );
  });

  it("exposes redacted authentication events only to security managers", async () => {
    const { service, repository } = await fixture();
    repository.listEvents.mockResolvedValue({
      items: [
        {
          eventId: "event-1",
          type: "login_succeeded",
          subjectId: "user-1",
          occurredAt: now,
          outcome: "success",
        },
      ],
      nextCursor: "cursor",
    });
    await expect(
      service.listAuthenticationAudit(["security_admin"], 25, "before"),
    ).resolves.toMatchObject({ nextCursor: "cursor" });
    expect(repository.listEvents).toHaveBeenCalledWith(25, "before");
    await expect(
      service.verifyAuthenticationAudit(["security_admin"]),
    ).resolves.toEqual({ status: "valid", checkedEvents: 0 });
    await expect(
      service.listAuthenticationAudit(["editor"], 25),
    ).rejects.toThrow(/permission/u);
  });

  it("reports only aggregate MFA key migration state to security managers", async () => {
    const retiringMfaKey = Buffer.alloc(32, 9).toString("base64");
    const { service, repository } = await fixture(
      {},
      { MFA_RETIRING_ENCRYPTION_KEYS: JSON.stringify([retiringMfaKey]) },
    );
    repository.listMfaCiphertexts.mockResolvedValue([
      encryptMfaSecret(mfaSecret, mfaKey),
      encryptMfaSecret(mfaSecret, retiringMfaKey),
      { encryptedSecret: "invalid", iv: "invalid", authTag: "invalid" },
    ]);

    await expect(
      service.mfaEncryptionStatus(["security_admin"], now),
    ).resolves.toEqual({
      checkedAt: now,
      checkedRecords: 3,
      activeKeyRecords: 1,
      retiringKeyRecords: 1,
      unreadableRecords: 1,
      configuredRetiringKeys: 1,
      truncated: false,
      safeToRetire: false,
    });
    expect(repository.listMfaCiphertexts).toHaveBeenCalledWith(1_001);
    const activeCiphertext = encryptMfaSecret(mfaSecret, mfaKey);
    repository.listMfaCiphertexts.mockResolvedValue(
      Array.from({ length: 1_001 }, () => activeCiphertext),
    );
    await expect(
      service.mfaEncryptionStatus(["security_admin"], now),
    ).resolves.toEqual(
      expect.objectContaining({
        checkedRecords: 1_000,
        activeKeyRecords: 1_000,
        truncated: true,
        safeToRetire: false,
      }),
    );
    await expect(service.mfaEncryptionStatus(["editor"], now)).rejects.toThrow(
      /permission/u,
    );
  });

  it("replaces another administrator's roles and immediately revokes every session", async () => {
    const { service, repository, user } = await fixture();
    repository.findUserById.mockResolvedValue(user);
    await expect(
      service.changeRoles(
        "security-1",
        ["security_admin"],
        user.userId,
        ["reviewer", "editor", "reviewer"],
        now,
      ),
    ).resolves.toMatchObject({
      userId: user.userId,
      roles: ["reviewer", "editor"],
      roleVersion: 2,
    });
    expect(repository.updateUserRoles).toHaveBeenCalledWith(user.userId, 1, [
      "reviewer",
      "editor",
    ]);
    expect(repository.revokeSessionsForUser).toHaveBeenCalledWith(
      user.userId,
      "roles_changed",
      now,
    );
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "role_changed",
        actorId: "security-1",
        subjectId: user.userId,
      }),
    );
  });

  it("fails closed for unauthorised, self and routine Principal mutations", async () => {
    const ordinary = await fixture();
    await expect(
      ordinary.service.changeRoles(
        "editor-1",
        ["editor"],
        "user-1",
        ["reviewer"],
        now,
      ),
    ).rejects.toThrow(/permission/u);

    const self = await fixture();
    await expect(
      self.service.changeRoles(
        "user-1",
        ["security_admin"],
        "user-1",
        ["reviewer"],
        now,
      ),
    ).rejects.toThrow(/own roles/u);

    const principal = await fixture({ roles: ["principal"] });
    await expect(
      principal.service.setAdministratorDisabled(
        "security-1",
        ["security_admin"],
        "user-1",
        true,
        now,
      ),
    ).rejects.toThrow(/break-glass/u);
    expect(principal.repository.setUserDisabled).not.toHaveBeenCalled();
  });

  it("disables and re-enables another administrator with immediate invalidation and audit", async () => {
    const disabled = await fixture();
    await expect(
      disabled.service.setAdministratorDisabled(
        "security-1",
        ["security_admin"],
        "user-1",
        true,
        now,
      ),
    ).resolves.toMatchObject({ disabledAt: now, roleVersion: 2 });
    expect(disabled.repository.revokeSessionsForUser).toHaveBeenCalledWith(
      "user-1",
      "user_disabled",
      now,
    );
    expect(disabled.repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "user_disabled", actorId: "security-1" }),
    );

    const enabled = await fixture({ disabledAt: now, roleVersion: 4 });
    await expect(
      enabled.service.setAdministratorDisabled(
        "security-1",
        ["security_admin"],
        "user-1",
        false,
        now,
      ),
    ).resolves.toEqual(
      expect.not.objectContaining({ disabledAt: expect.anything() }),
    );
    expect(enabled.repository.setUserDisabled).toHaveBeenCalledWith(
      "user-1",
      4,
      false,
      now,
    );
  });

  it("issues a short-lived hashed invitation and accepts it only with its enrolled TOTP", async () => {
    const { service, repository } = await fixture();
    repository.findUserByEmail.mockResolvedValue(null);
    let persisted:
      | Parameters<AuthRepository["createInvitedUser"]>[0]
      | undefined;
    repository.createInvitedUser.mockImplementation(
      (input: Parameters<AuthRepository["createInvitedUser"]>[0]) => {
        persisted = input;
        return Promise.resolve({
          userId: input.userId,
          emailCanonical: input.emailCanonical,
          roles: input.roles,
          roleVersion: 1,
          invitedAt: input.invitedAt,
        });
      },
    );
    const issued = await service.inviteAdministrator(
      "security-1",
      ["security_admin"],
      " New.Editor@Example.Test ",
      ["editor"],
      now,
    );
    expect(persisted).toBeDefined();
    const stored = persisted!;
    expect(issued.invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(stored).toEqual(
      expect.objectContaining({
        emailCanonical: "new.editor@example.test",
        invitationTokenHash: expect.not.stringContaining(
          issued.invitationToken,
        ),
        invitationExpiresAt: new Date("2026-08-10T18:00:00.000Z"),
      }),
    );
    repository.findInvitationByHash.mockResolvedValue({
      ...stored,
      roleVersion: 1,
    });
    const setup = await service.invitationSetup(issued.invitationToken, now);
    expect(setup.enrollmentUri).toMatch(/^otpauth:\/\/totp\//u);
    const secret = decryptMfaSecret(stored.mfa, mfaKey);
    await service.acceptInvitation(
      issued.invitationToken,
      "a-new-secure-administrator-password",
      generateTotpForTesting(secret, now),
      now,
    );
    expect(repository.acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: stored.userId,
        matchedMfaStep: Math.floor(now.getTime() / 30_000),
      }),
    );
    expect(repository.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invitation_accepted" }),
    );
  });

  it("accepts an unexpired invitation hashed with a retiring session pepper", async () => {
    const retiringPepper =
      "retiring-pepper-that-is-definitely-longer-than-32-bytes";
    const { service, repository, user } = await fixture(
      {},
      { SESSION_RETIRING_PEPPERS: JSON.stringify([retiringPepper]) },
    );
    const token = randomBytes(32).toString("base64url");
    const retiringHash = createHmac("sha256", retiringPepper)
      .update(`administrator-invitation:${token}`)
      .digest("base64url");
    repository.findInvitationByHash.mockImplementation((hash) =>
      Promise.resolve(
        hash === retiringHash
          ? {
              ...user,
              invitationTokenHash: retiringHash,
              invitationExpiresAt: new Date("2026-08-10T18:00:00Z"),
            }
          : null,
      ),
    );

    await expect(service.invitationSetup(token, now)).resolves.toEqual(
      expect.objectContaining({ email: user.emailCanonical }),
    );
    expect(repository.findInvitationByHash).toHaveBeenCalledTimes(2);
  });

  it("migrates retiring-key MFA ciphertext after authenticating an invitation token", async () => {
    const retiringMfaKey = Buffer.alloc(32, 8).toString("base64");
    const encrypted = encryptMfaSecret(mfaSecret, retiringMfaKey);
    const { service, repository, user } = await fixture(
      { mfa: { ...encrypted, enrolledAt: now } },
      { MFA_RETIRING_ENCRYPTION_KEYS: JSON.stringify([retiringMfaKey]) },
    );
    const token = randomBytes(32).toString("base64url");
    repository.findInvitationByHash.mockResolvedValue({
      ...user,
      invitationExpiresAt: new Date("2026-08-10T18:00:00Z"),
    });

    await expect(service.invitationSetup(token, now)).resolves.toEqual(
      expect.objectContaining({ email: user.emailCanonical }),
    );
    expect(repository.rotateMfaEncryption).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.userId, expected: encrypted }),
    );
  });
});
