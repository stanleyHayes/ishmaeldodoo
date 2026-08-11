import { createHmac, randomBytes, randomUUID } from "node:crypto";

export type ServiceAuthConfiguration = Readonly<{
  keyId: string;
  secret: string;
  audience: string;
}>;

export function serviceSigningPayload(
  input: Readonly<{
    method: string;
    requestTarget: string;
    audience: string;
    timestamp: string;
    nonce: string;
  }>,
): string {
  return [
    "amanor-service-v1",
    input.method.toUpperCase(),
    input.requestTarget,
    input.audience,
    input.timestamp,
    input.nonce,
  ].join("\n");
}

export function serviceAuthHeaders(
  url: URL,
  configuration?: ServiceAuthConfiguration,
  method = "GET",
  correlation?: Readonly<{ requestId: string; traceparent: string }>,
): Record<string, string> {
  const requestId = correlation?.requestId ?? randomUUID();
  const traceparent =
    correlation?.traceparent ??
    `00-${randomBytes(16).toString("hex")}-${randomBytes(8).toString("hex")}-01`;
  if (!configuration) return { "X-Request-ID": requestId, traceparent };
  const timestamp = Date.now().toString();
  const nonce = randomUUID();
  const requestTarget = `${url.pathname}${url.search}`;
  const signature = createHmac("sha256", configuration.secret)
    .update(
      serviceSigningPayload({
        method,
        requestTarget,
        audience: configuration.audience,
        timestamp,
        nonce,
      }),
    )
    .digest("base64url");
  return {
    "X-Amanor-Service-Key-Id": configuration.keyId,
    "X-Amanor-Service-Audience": configuration.audience,
    "X-Amanor-Service-Timestamp": timestamp,
    "X-Amanor-Service-Nonce": nonce,
    "X-Amanor-Service-Signature": signature,
    "X-Request-ID": requestId,
    traceparent,
  };
}
