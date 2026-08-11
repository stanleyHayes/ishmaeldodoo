import { createHash, timingSafeEqual } from "node:crypto";

export const refreshCookieName = "__Secure-amanor_refresh";

export const refreshCookiePolicy = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/v1/auth",
  maxAge: 1_000 * 60 * 60 * 24 * 30,
});

export const csrfCookieName = "__Secure-amanor_csrf";
export const csrfCookiePolicy = Object.freeze({
  httpOnly: false,
  secure: true,
  sameSite: "strict" as const,
  path: "/v1/auth",
  maxAge: refreshCookiePolicy.maxAge,
});

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function assertTrustedMutationOrigin(
  originHeader: string | null,
  applicationBaseUrl: string,
): void {
  if (!originHeader) throw new Error("Mutation origin is required");
  const expected = new URL(applicationBaseUrl).origin;
  let actual: string;
  try {
    actual = new URL(originHeader).origin;
  } catch {
    throw new Error("Mutation origin is invalid");
  }
  if (actual !== expected) throw new Error("Mutation origin is not trusted");
}

export function assertCsrfProof(
  cookieValue: string | null,
  headerValue: string | null,
  storedHash: string,
): void {
  if (!cookieValue || !headerValue || cookieValue !== headerValue) {
    throw new Error("CSRF proof is missing or mismatched");
  }
  const actual = sha256(headerValue);
  const expected = Buffer.from(storedHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("CSRF proof is invalid");
  }
}

export function csrfTokenHash(token: string): string {
  return sha256(token).toString("hex");
}
