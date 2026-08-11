import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidationSigningPayload } from "@amanor/contracts";

export function signRevalidation(
  keyId: string,
  audience: string,
  timestamp: string,
  rawBody: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(revalidationSigningPayload(keyId, audience, timestamp, rawBody))
    .digest("base64url");
}

export function verifyRevalidationSignature(
  keyId: string,
  audience: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(
    signRevalidation(keyId, audience, timestamp, rawBody, secret),
  );
  const presented = Buffer.from(signature);
  return (
    expected.length === presented.length && timingSafeEqual(expected, presented)
  );
}
