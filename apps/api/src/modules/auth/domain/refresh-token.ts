import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const tokenPattern = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/;

export type RefreshToken = Readonly<{
  sessionId: string;
  raw: string;
  hash: string;
}>;

export function hashRefreshSecret(secret: string, pepper: string): string {
  if (pepper.length < 32)
    throw new Error("Session pepper must be at least 32 characters");
  return createHmac("sha256", pepper).update(secret, "utf8").digest("hex");
}

export function createRefreshToken(
  pepper: string,
  sessionId: string = randomUUID(),
): RefreshToken {
  const secret = randomBytes(32).toString("base64url");
  return {
    sessionId,
    raw: `${sessionId}.${secret}`,
    hash: hashRefreshSecret(secret, pepper),
  };
}

export function parseRefreshToken(
  raw: string,
): Readonly<{ sessionId: string; secret: string }> {
  const match = tokenPattern.exec(raw);
  if (!match?.[1] || !match[2]) throw new Error("Refresh token is malformed");
  return { sessionId: match[1], secret: match[2] };
}

export function refreshHashMatches(
  candidate: string,
  expectedHash: string,
  pepper: string,
): boolean {
  const candidateHash = Buffer.from(
    hashRefreshSecret(candidate, pepper),
    "hex",
  );
  const expected = Buffer.from(expectedHash, "hex");
  return (
    candidateHash.length === expected.length &&
    timingSafeEqual(candidateHash, expected)
  );
}
