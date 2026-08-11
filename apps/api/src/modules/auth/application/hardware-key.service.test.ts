import { ConfigService } from "@nestjs/config";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HardwareKeyService } from "./hardware-key.service";
import type { HardwareKeyRepository } from "../persistence/hardware-key.repository";
import type { AuthService } from "./auth.service";
import type { JwtKeyService } from "./jwt-key.service";
import type { AccessTokenClaims } from "../domain/access-token";

const now = new Date("2026-08-11T12:00:00.000Z");
const claims: AccessTokenClaims = {
  subject: "user-1",
  sessionId: "session-1",
  roles: ["security_admin"],
  roleVersion: 1,
  authenticationMethods: ["pwd", "totp", "step_up"],
  stepUpAt: Math.floor(now.getTime() / 1_000),
};

function fixture(enabled = true) {
  const repository = {
    list: vi.fn().mockResolvedValue([]),
    createCeremony: vi.fn().mockResolvedValue(undefined),
  };
  const auth = {
    findActiveUserForHardwareKey: vi.fn().mockResolvedValue({
      userId: "user-1",
      emailCanonical: "admin@example.test",
    }),
  };
  const values: Record<string, string> = {
    WEBAUTHN_ENABLED: enabled ? "true" : "false",
    WEBAUTHN_RP_ID: "admin.example.test",
    WEBAUTHN_RP_NAME: "Project AMANOR Admin",
    WEBAUTHN_ORIGIN: "https://admin.example.test",
  };
  const configuration = {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key],
  } as ConfigService;
  return {
    repository,
    service: new HardwareKeyService(
      repository as unknown as HardwareKeyRepository,
      auth as unknown as AuthService,
      {} as JwtKeyService,
      configuration,
    ),
  };
}

describe("HardwareKeyService", () => {
  it("fails closed when WebAuthn is disabled", async () => {
    await expect(
      fixture(false).service.registrationOptions(claims, now),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("requires a recent TOTP step-up before enrollment", async () => {
    const stale = { ...claims, stepUpAt: claims.stepUpAt! - 301 };
    await expect(
      fixture().service.registrationOptions(stale, now),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates a five-minute, user-bound registration ceremony without persisting the challenge", async () => {
    const { service, repository } = fixture();
    const result = (await service.registrationOptions(claims, now)) as {
      ceremonyId: string;
      options: {
        challenge: string;
        rp: { id: string };
        authenticatorSelection: { userVerification: string };
      };
    };
    expect(result.options.rp.id).toBe("admin.example.test");
    expect(result.options.authenticatorSelection.userVerification).toBe(
      "required",
    );
    expect(repository.createCeremony).toHaveBeenCalledWith(
      expect.objectContaining({
        ceremonyId: result.ceremonyId,
        userId: "user-1",
        sessionId: "session-1",
        purpose: "registration",
        expiresAt: new Date(now.getTime() + 300_000),
      }),
    );
    const stored = repository.createCeremony.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(stored.challengeHash).not.toBe(result.options.challenge);
  });
});
