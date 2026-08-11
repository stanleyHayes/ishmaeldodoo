import { createHmac } from "node:crypto";
import { revalidationSigningPayload } from "@amanor/contracts";

export function signRevalidationRequest(
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
