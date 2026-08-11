import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AccessTokenGuard } from "./access-token.guard";

function context(authorization?: string) {
  const request = {
    header: (name: string) =>
      name === "authorization" ? authorization : undefined,
  } as { header(name: string): string | undefined; auth?: unknown };
  return {
    request,
    executionContext: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext,
  };
}

describe("AccessTokenGuard", () => {
  it("accepts a verified token only while its user and server session remain active", async () => {
    const jwt = {
      verify: vi.fn().mockResolvedValue({
        subject: "user-1",
        sessionId: "session-1",
        roles: ["editor"],
        roleVersion: 2,
        authenticationMethods: ["pwd", "totp"],
      }),
    };
    const repository = {
      findBySessionId: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        userId: "user-1",
        roleVersion: 2,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      findUserById: vi
        .fn()
        .mockResolvedValue({ userId: "user-1", roleVersion: 2 }),
    };
    const guard = new AccessTokenGuard(jwt as never, repository as never);
    const request = context("Bearer signed-token");
    await expect(guard.canActivate(request.executionContext)).resolves.toBe(
      true,
    );
    expect(request.request.auth).toEqual(
      expect.objectContaining({ subject: "user-1" }),
    );
  });

  it("rejects malformed bearer headers, revoked sessions and role-version drift uniformly", async () => {
    const jwt = {
      verify: vi.fn().mockResolvedValue({
        subject: "user-1",
        sessionId: "session-1",
        roles: ["editor"],
        roleVersion: 1,
        authenticationMethods: ["pwd", "totp"],
      }),
    };
    const repository = {
      findBySessionId: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        userId: "user-1",
        roleVersion: 1,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }),
      findUserById: vi
        .fn()
        .mockResolvedValue({ userId: "user-1", roleVersion: 2 }),
    };
    const guard = new AccessTokenGuard(jwt as never, repository as never);
    await expect(
      guard.canActivate(context(undefined).executionContext),
    ).rejects.toThrow("Access token is invalid or expired");
    await expect(
      guard.canActivate(context("Basic token").executionContext),
    ).rejects.toThrow("Access token is invalid or expired");
    await expect(
      guard.canActivate(context("Bearer signed-token").executionContext),
    ).rejects.toThrow("Access token is invalid or expired");
  });
});
