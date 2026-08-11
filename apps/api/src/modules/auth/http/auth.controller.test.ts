import "reflect-metadata";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../application/auth.service";
import {
  csrfCookieName,
  refreshCookieName,
} from "../application/request-security";
import { AuthController } from "./auth.controller";
import { AccessTokenGuard } from "./access-token.guard";
import { JwtKeyService } from "../application/jwt-key.service";
import { AuthRepository } from "../persistence/auth.repository";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { RateLimitService } from "../application/rate-limit.service";
import { HardwareKeyService } from "../application/hardware-key.service";

describe("AuthController HTTP boundary", () => {
  let app: INestApplication;
  const auth = {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    listAdministrators: vi.fn(),
    changeRoles: vi.fn(),
    setAdministratorDisabled: vi.fn(),
    inviteAdministrator: vi.fn(),
    invitationSetup: vi.fn(),
    acceptInvitation: vi.fn(),
    listAuthenticationAudit: vi.fn(),
    verifyAuthenticationAudit: vi.fn(),
    mfaEncryptionStatus: vi.fn(),
    stepUp: vi.fn(),
    rotateRecoveryCodes: vi.fn(),
  };
  const hardwareKeys = {
    registrationOptions: vi.fn(),
    verifyRegistration: vi.fn(),
    authenticationOptions: vi.fn(),
    verifyAuthentication: vi.fn(),
    list: vi.fn(),
    revoke: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: HardwareKeyService,
          useValue: hardwareKeys,
        },
        AccessTokenGuard,
        AuthRateLimitGuard,
        {
          provide: RateLimitService,
          useValue: {
            consume: vi.fn().mockResolvedValue({
              allowed: true,
              remaining: 4,
              retryAfterSeconds: 900,
            }),
          },
        },
        {
          provide: JwtKeyService,
          useValue: {
            verify: vi.fn().mockResolvedValue({
              subject: "user-1",
              sessionId: "session-current",
              roles: ["security_admin"],
              roleVersion: 1,
              authenticationMethods: ["pwd", "totp", "step_up"],
              stepUpAt: Math.floor(Date.now() / 1_000),
            }),
          },
        },
        {
          provide: AuthRepository,
          useValue: {
            findBySessionId: vi.fn().mockResolvedValue({
              sessionId: "session-current",
              userId: "user-1",
              roleVersion: 1,
              expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            }),
            findUserById: vi
              .fn()
              .mockResolvedValue({ userId: "user-1", roleVersion: 1 }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) =>
              key === "ADMIN_ORIGIN" ? "https://admin.example.test" : undefined,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => app.close());

  it("rejects missing/wrong origins and malformed input before authentication", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({
        email: "editor@example.test",
        password: "a-long-enough-password",
        mfaCode: "123456",
      })
      .expect(403);
    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", "https://evil.example.test")
      .send({
        email: "editor@example.test",
        password: "a-long-enough-password",
        mfaCode: "123456",
      })
      .expect(403);
    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", "https://admin.example.test")
      .send({ email: "not-an-email", password: "short", mfaCode: "x" })
      .expect(400);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("keeps refresh material out of JSON and sets hardened cookies", async () => {
    auth.login.mockResolvedValue({
      accessToken: "signed-access-token",
      refreshToken: "session-id.refresh-secret",
      csrfToken: "csrf-proof-value-that-is-long-enough",
      expiresIn: 300,
      user: { id: "user-1", roles: ["editor"] },
    });
    const response = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", "https://admin.example.test")
      .send({
        email: "editor@example.test",
        password: "a-long-enough-password",
        mfaCode: "123456",
      })
      .expect(200);

    expect(response.body).not.toHaveProperty("refreshToken");
    expect(response.body).toEqual(
      expect.objectContaining({
        accessToken: "signed-access-token",
        expiresIn: 300,
      }),
    );
    const cookies = response.headers["set-cookie"] as unknown as string[];
    expect(
      cookies.some(
        (cookie) =>
          cookie.startsWith(`${refreshCookieName}=`) &&
          cookie.includes("HttpOnly") &&
          cookie.includes("Secure") &&
          cookie.includes("SameSite=Strict"),
      ),
    ).toBe(true);
    expect(
      cookies.some(
        (cookie) =>
          cookie.startsWith(`${csrfCookieName}=`) &&
          !cookie.includes("HttpOnly") &&
          cookie.includes("Secure"),
      ),
    ).toBe(true);
  });

  it("forwards a single-use recovery code without requiring a TOTP field", async () => {
    auth.login.mockResolvedValue({
      accessToken: "recovery-access-token",
      refreshToken: "session-id.refresh-secret",
      csrfToken: "csrf-proof-value-that-is-long-enough",
      expiresIn: 300,
      user: { id: "user-1", roles: ["editor"] },
    });
    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", "https://admin.example.test")
      .send({
        email: "editor@example.test",
        password: "a-long-enough-password",
        recoveryCode: "ABCD-2345-EFGH-6789",
      })
      .expect(200);
    expect(auth.login).toHaveBeenCalledWith(
      "editor@example.test",
      "a-long-enough-password",
      { recoveryCode: "ABCD-2345-EFGH-6789" },
    );
  });

  it("issues a recent-MFA token and rejects high-risk changes without it", async () => {
    auth.stepUp.mockResolvedValue({
      accessToken: "elevated-access-token",
      expiresIn: 300,
    });
    await request(app.getHttpServer())
      .post("/v1/auth/step-up")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .send({ mfaCode: "123456" })
      .expect(200)
      .expect({ accessToken: "elevated-access-token", expiresIn: 300 });
    expect(auth.stepUp).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "user-1" }),
      "123456",
    );

    auth.rotateRecoveryCodes.mockResolvedValue({
      recoveryCodes: Array.from({ length: 8 }, () => "ABCD-2345-EFGH-6789"),
    });
    await request(app.getHttpServer())
      .post("/v1/auth/recovery-codes/rotate")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .expect(200);
    expect(auth.rotateRecoveryCodes).toHaveBeenCalledWith(
      "user-1",
      "session-current",
    );

    vi.mocked(app.get(JwtKeyService).verify).mockResolvedValueOnce({
      subject: "user-1",
      sessionId: "session-current",
      roles: ["security_admin"],
      roleVersion: 1,
      authenticationMethods: ["pwd", "totp"],
    });
    await request(app.getHttpServer())
      .post("/v1/auth/invitations")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .send({ email: "new@example.test", roles: ["editor"] })
      .expect(403);
    expect(auth.inviteAdministrator).not.toHaveBeenCalled();
  });

  it("passes cookie/header proof to refresh and clears both cookies on logout", async () => {
    auth.refresh.mockResolvedValue({
      accessToken: "next-access-token",
      refreshToken: "session-id.next-secret",
      expiresIn: 300,
      user: { id: "user-1", roles: ["editor"] },
    });
    const cookieHeader = `${refreshCookieName}=session-id.current-secret; ${csrfCookieName}=csrf-proof`;
    await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Origin", "https://admin.example.test")
      .set("Cookie", cookieHeader)
      .set("X-CSRF-Token", "csrf-proof")
      .expect(200);
    expect(auth.refresh).toHaveBeenCalledWith(
      "session-id.current-secret",
      "csrf-proof",
      "csrf-proof",
    );

    const logout = await request(app.getHttpServer())
      .post("/v1/auth/logout")
      .set("Origin", "https://admin.example.test")
      .set("Cookie", cookieHeader)
      .set("X-CSRF-Token", "csrf-proof")
      .expect(204);
    expect(auth.logout).toHaveBeenCalledOnce();
    const cookies = logout.headers["set-cookie"] as unknown as string[];
    expect(
      cookies.filter((cookie) => cookie.includes("Expires=Thu, 01 Jan 1970"))
        .length,
    ).toBe(2);
  });

  it("lists and revokes only authenticated user sessions", async () => {
    auth.listSessions.mockResolvedValue([
      {
        sessionId: "session-current",
        familyId: "family-current",
        authenticationMethods: ["pwd", "totp"],
        createdAt: new Date("2026-08-09T18:00:00.000Z"),
        expiresAt: new Date("2026-09-08T18:00:00.000Z"),
      },
    ]);
    auth.revokeSession.mockResolvedValue(true);

    const sessions = await request(app.getHttpServer())
      .get("/v1/auth/sessions")
      .set("Authorization", "Bearer test")
      .expect(200);
    const body = sessions.body as Array<{
      sessionId: string;
      current: boolean;
    }>;
    expect(body[0]).toEqual(
      expect.objectContaining({ sessionId: "session-current", current: true }),
    );
    expect(auth.listSessions).toHaveBeenCalledWith("user-1");

    await request(app.getHttpServer())
      .delete("/v1/auth/sessions/session-current")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .expect(204);
    expect(auth.revokeSession).toHaveBeenCalledWith(
      "user-1",
      "session-current",
    );
  });

  it("exposes origin-protected role and status administration without accepting unknown roles", async () => {
    const summary = {
      userId: "editor-2",
      emailCanonical: "editor-2@example.test",
      roles: ["reviewer"],
      roleVersion: 2,
    };
    auth.listAdministrators.mockResolvedValue([summary]);
    auth.changeRoles.mockResolvedValue(summary);
    auth.setAdministratorDisabled.mockResolvedValue({
      ...summary,
      disabledAt: new Date("2026-08-10T00:00:00.000Z"),
    });
    await request(app.getHttpServer())
      .get("/v1/auth/users")
      .set("Authorization", "Bearer test")
      .expect(200)
      .expect([summary]);

    await request(app.getHttpServer())
      .patch("/v1/auth/users/editor-2/roles")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .send({ roles: ["not_a_role"] })
      .expect(400);
    await request(app.getHttpServer())
      .patch("/v1/auth/users/editor-2/roles")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .send({ roles: ["reviewer"] })
      .expect(200);
    expect(auth.changeRoles).toHaveBeenCalledWith(
      "user-1",
      ["security_admin"],
      "editor-2",
      ["reviewer"],
    );

    await request(app.getHttpServer())
      .patch("/v1/auth/users/editor-2/status")
      .set("Authorization", "Bearer test")
      .send({ disabled: true })
      .expect(403);
    await request(app.getHttpServer())
      .patch("/v1/auth/users/editor-2/status")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .send({ disabled: true })
      .expect(200);
    expect(auth.setAdministratorDisabled).toHaveBeenCalledWith(
      "user-1",
      ["security_admin"],
      "editor-2",
      true,
    );
  });

  it("validates protected invitation issuance and public one-time setup boundaries", async () => {
    const token = "a".repeat(43);
    auth.inviteAdministrator.mockResolvedValue({
      administrator: {
        userId: "new-user",
        emailCanonical: "new@example.test",
        roles: ["editor"],
        roleVersion: 1,
      },
      invitationToken: token,
    });
    auth.invitationSetup.mockResolvedValue({
      email: "new@example.test",
      enrollmentUri: "otpauth://totp/example",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    });
    auth.acceptInvitation.mockResolvedValue({
      recoveryCodes: Array.from({ length: 8 }, () => "ABCD-2345-EFGH-6789"),
    });

    await request(app.getHttpServer())
      .post("/v1/auth/invitations")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .send({ email: "new@example.test", roles: ["unknown"] })
      .expect(400);
    await request(app.getHttpServer())
      .post("/v1/auth/invitations")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .send({ email: "new@example.test", roles: ["editor"] })
      .expect(201);
    expect(auth.inviteAdministrator).toHaveBeenCalledWith(
      "user-1",
      ["security_admin"],
      "new@example.test",
      ["editor"],
    );

    await request(app.getHttpServer())
      .post("/v1/auth/invitations/setup")
      .set("Origin", "https://admin.example.test")
      .send({ token })
      .expect(200);
    await request(app.getHttpServer())
      .post("/v1/auth/invitations/accept")
      .set("Origin", "https://admin.example.test")
      .send({
        token,
        password: "a-new-secure-administrator-password",
        mfaCode: "123456",
      })
      .expect(200)
      .expect({
        recoveryCodes: Array.from({ length: 8 }, () => "ABCD-2345-EFGH-6789"),
      });
    expect(auth.acceptInvitation).toHaveBeenCalledWith(
      token,
      "a-new-secure-administrator-password",
      "123456",
    );
  });

  it("validates and forwards bounded authentication audit pagination", async () => {
    auth.listAuthenticationAudit.mockResolvedValue({ items: [] });
    auth.verifyAuthenticationAudit.mockResolvedValue({
      status: "valid",
      checkedEvents: 2,
      headHash: "a".repeat(64),
    });
    await request(app.getHttpServer())
      .get("/v1/auth/audit?limit=101")
      .set("Authorization", "Bearer test")
      .expect(400);
    await request(app.getHttpServer())
      .get("/v1/auth/audit?limit=25&cursor=cursor")
      .set("Authorization", "Bearer test")
      .expect(200)
      .expect({ items: [] });
    expect(auth.listAuthenticationAudit).toHaveBeenCalledWith(
      ["security_admin"],
      25,
      "cursor",
    );
    await request(app.getHttpServer())
      .get("/v1/auth/audit/integrity")
      .set("Authorization", "Bearer test")
      .expect(200)
      .expect({
        status: "valid",
        checkedEvents: 2,
        headHash: "a".repeat(64),
      });
  });

  it("returns the protected aggregate MFA encryption status", async () => {
    auth.mfaEncryptionStatus.mockResolvedValue({
      checkedAt: new Date("2026-08-10T00:00:00Z"),
      checkedRecords: 2,
      activeKeyRecords: 2,
      retiringKeyRecords: 0,
      unreadableRecords: 0,
      configuredRetiringKeys: 1,
      truncated: false,
      safeToRetire: true,
    });
    await request(app.getHttpServer())
      .get("/v1/auth/mfa/encryption-status")
      .set("Authorization", "Bearer test")
      .expect(200)
      .expect({
        checkedAt: "2026-08-10T00:00:00.000Z",
        checkedRecords: 2,
        activeKeyRecords: 2,
        retiringKeyRecords: 0,
        unreadableRecords: 0,
        configuredRetiringKeys: 1,
        truncated: false,
        safeToRetire: true,
      });
    expect(auth.mfaEncryptionStatus).toHaveBeenCalledWith(["security_admin"]);
  });

  it("protects WebAuthn ceremonies with bearer authentication, exact origin and runtime validation", async () => {
    hardwareKeys.registrationOptions.mockResolvedValue({
      ceremonyId: "32d5429e-aa83-4c54-b3db-ea6c8b0d59fe",
      options: { challenge: "challenge" },
    });
    hardwareKeys.list.mockResolvedValue([]);
    await request(app.getHttpServer())
      .post("/v1/auth/hardware-keys/registration/options")
      .set("Authorization", "Bearer test")
      .expect(403);
    await request(app.getHttpServer())
      .post("/v1/auth/hardware-keys/registration/options")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .expect(201);
    await request(app.getHttpServer())
      .post("/v1/auth/hardware-keys/registration/verify")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .send({ ceremonyId: "not-a-uuid", response: {}, label: "Office key" })
      .expect(400);
    await request(app.getHttpServer())
      .get("/v1/auth/hardware-keys")
      .set("Authorization", "Bearer test")
      .expect(200)
      .expect([]);
    await request(app.getHttpServer())
      .delete("/v1/auth/hardware-keys/not valid")
      .set("Authorization", "Bearer test")
      .set("Origin", "https://admin.example.test")
      .expect(400);
  });
});
