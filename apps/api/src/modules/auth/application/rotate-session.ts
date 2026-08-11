import {
  createRefreshToken,
  hashRefreshSecret,
  parseRefreshToken,
  refreshHashMatches,
} from "../domain/refresh-token";
import { sessionIsActive, type Session } from "../domain/session";

export interface SessionRepository {
  findBySessionId(sessionId: string): Promise<Session | null>;
  rotate(input: {
    sessionId: string;
    familyId: string;
    expectedCurrentHash: string;
    nextHash: string;
    consumedHash: string;
    rotatedAt: Date;
    expiresAt: Date;
  }): Promise<boolean>;
  wasRefreshHashConsumed(
    sessionId: string,
    tokenHash: string,
  ): Promise<boolean>;
  revokeFamily(
    familyId: string,
    reason: string,
    revokedAt: Date,
  ): Promise<void>;
}

export type RotationResult = Readonly<{
  refreshToken: string;
  session: Session;
}>;

export class RefreshTokenReuseError extends Error {
  constructor() {
    super("Refresh token reuse detected");
    this.name = "RefreshTokenReuseError";
  }
}

export class RefreshRotationConflictError extends Error {
  constructor() {
    super("Refresh token rotation conflict");
    this.name = "RefreshRotationConflictError";
  }
}

export async function rotateSession(
  repository: SessionRepository,
  rawRefreshToken: string,
  pepperOrRing: string | readonly [string, ...string[]],
  now = new Date(),
): Promise<RotationResult> {
  const peppers =
    typeof pepperOrRing === "string" ? [pepperOrRing] : pepperOrRing;
  const activePepper = peppers[0];
  const parsed = parseRefreshToken(rawRefreshToken);
  const session = await repository.findBySessionId(parsed.sessionId);
  if (!session || !sessionIsActive(session, now)) {
    throw new Error("Session is invalid or expired");
  }

  const presentedHashes = peppers.map((pepper) =>
    hashRefreshSecret(parsed.secret, pepper),
  );
  const currentHashIndex = peppers.findIndex((pepper) =>
    refreshHashMatches(parsed.secret, session.currentRefreshHash, pepper),
  );
  if (currentHashIndex < 0) {
    const consumedChecks = await Promise.all(
      presentedHashes.map((hash) =>
        repository.wasRefreshHashConsumed(session.sessionId, hash),
      ),
    );
    if (consumedChecks.some(Boolean)) {
      await repository.revokeFamily(
        session.familyId,
        "refresh_token_reuse",
        now,
      );
      throw new RefreshTokenReuseError();
    }
    throw new Error("Refresh token is invalid");
  }

  const presentedHash = presentedHashes[currentHashIndex]!;

  const next = createRefreshToken(activePepper, session.sessionId);
  const rotated = await repository.rotate({
    sessionId: session.sessionId,
    familyId: session.familyId,
    expectedCurrentHash: presentedHash,
    nextHash: next.hash,
    consumedHash: presentedHash,
    rotatedAt: now,
    expiresAt: session.expiresAt,
  });

  if (!rotated) {
    await repository.revokeFamily(
      session.familyId,
      "refresh_rotation_race",
      now,
    );
    throw new RefreshRotationConflictError();
  }

  return {
    refreshToken: next.raw,
    session: { ...session, currentRefreshHash: next.hash },
  };
}
