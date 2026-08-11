import { describe, expect, it, vi } from "vitest";
import { createRefreshToken, hashRefreshSecret } from "../domain/refresh-token";
import type { Session } from "../domain/session";
import { rotateSession, type SessionRepository } from "./rotate-session";

const pepper = "a-session-pepper-that-is-definitely-longer-than-32-bytes";

function repositoryFor(
  session: Session,
  rotateResult = true,
  consumed = false,
): SessionRepository {
  return {
    findBySessionId: vi.fn().mockResolvedValue(session),
    wasRefreshHashConsumed: vi.fn().mockResolvedValue(consumed),
    rotate: vi.fn().mockResolvedValue(rotateResult),
    revokeFamily: vi.fn().mockResolvedValue(undefined),
  };
}

function activeSession(rawToken: string): Session {
  const [, secret] = rawToken.split(".");
  if (!secret) throw new Error("Fixture token is malformed");
  return {
    sessionId: rawToken.split(".")[0]!,
    familyId: "family-1",
    userId: "user-1",
    roles: ["editor"],
    roleVersion: 1,
    currentRefreshHash: hashRefreshSecret(secret, pepper),
    csrfHash: "csrf",
    authenticationMethods: ["pwd", "hwk"],
    expiresAt: new Date("2030-01-01"),
  };
}

describe("refresh token rotation", () => {
  it("rotates the current secret with a compare-and-swap", async () => {
    const token = createRefreshToken(pepper);
    const repository = repositoryFor(activeSession(token.raw));
    const result = await rotateSession(
      repository,
      token.raw,
      pepper,
      new Date("2026-08-09"),
    );

    expect(result.refreshToken).not.toBe(token.raw);
    expect(repository.rotate).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: token.sessionId,
        familyId: "family-1",
        expectedCurrentHash: token.hash,
        expiresAt: new Date("2030-01-01"),
      }),
    );
  });

  it("accepts a retiring pepper and migrates the next token to the active pepper", async () => {
    const activePepper =
      "active-pepper-that-is-definitely-longer-than-32-bytes";
    const retiringPepper =
      "retiring-pepper-that-is-definitely-longer-than-32-bytes";
    const token = createRefreshToken(retiringPepper);
    const [, secret] = token.raw.split(".");
    if (!secret) throw new Error("Fixture token is malformed");
    const session = {
      ...activeSession(token.raw),
      currentRefreshHash: hashRefreshSecret(secret, retiringPepper),
    };
    const repository = repositoryFor(session);

    const result = await rotateSession(
      repository,
      token.raw,
      [activePepper, retiringPepper],
      new Date("2026-08-09"),
    );
    const [, nextSecret] = result.refreshToken.split(".");
    if (!nextSecret) throw new Error("Rotated token is malformed");

    expect(result.session.currentRefreshHash).toBe(
      hashRefreshSecret(nextSecret, activePepper),
    );
    expect(repository.rotate).toHaveBeenCalledWith(
      expect.objectContaining({ expectedCurrentHash: token.hash }),
    );
  });

  it("detects replay hashes produced by a retiring pepper", async () => {
    const retiringPepper =
      "retiring-pepper-that-is-definitely-longer-than-32-bytes";
    const replayed = createRefreshToken(retiringPepper);
    const current = createRefreshToken(pepper, replayed.sessionId);
    const repository = repositoryFor(activeSession(current.raw), true, false);
    vi.mocked(repository.wasRefreshHashConsumed).mockImplementation(
      (_sessionId, hash) => Promise.resolve(hash === replayed.hash),
    );

    await expect(
      rotateSession(repository, replayed.raw, [pepper, retiringPepper]),
    ).rejects.toThrow(/reuse/i);
    expect(repository.revokeFamily).toHaveBeenCalledWith(
      "family-1",
      "refresh_token_reuse",
      expect.any(Date),
    );
  });

  it("revokes a token family when a consumed token is replayed", async () => {
    const oldToken = createRefreshToken(pepper);
    const currentToken = createRefreshToken(pepper, oldToken.sessionId);
    const session = activeSession(currentToken.raw);
    const repository = repositoryFor(session, true, true);

    await expect(
      rotateSession(repository, oldToken.raw, pepper),
    ).rejects.toThrow(/reuse/i);
    expect(repository.revokeFamily).toHaveBeenCalledWith(
      "family-1",
      "refresh_token_reuse",
      expect.any(Date),
    );
    expect(repository.wasRefreshHashConsumed).toHaveBeenCalledWith(
      oldToken.sessionId,
      oldToken.hash,
    );
  });

  it("revokes the family when concurrent rotation loses compare-and-swap", async () => {
    const token = createRefreshToken(pepper);
    const repository = repositoryFor(activeSession(token.raw), false);

    await expect(rotateSession(repository, token.raw, pepper)).rejects.toThrow(
      /conflict/i,
    );
    expect(repository.revokeFamily).toHaveBeenCalledWith(
      "family-1",
      "refresh_rotation_race",
      expect.any(Date),
    );
  });
});
