import { createHmac, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { PublicServiceGuard } from "./public-service.guard";

const currentSecret = "current-service-secret-with-more-than-32-bytes";
const previousSecret = "previous-service-secret-with-more-than-32-bytes";

function headers(
  keyId: string,
  secret: string,
  overrides: Partial<Record<string, string>> = {},
) {
  const audience = overrides.audience ?? "amanor-public-api";
  const timestamp = overrides.timestamp ?? Date.now().toString();
  const nonce = overrides.nonce ?? randomUUID();
  const target =
    overrides.target ?? "/v1/public/content/page/home?locale=en-GB";
  const payload = [
    "amanor-service-v1",
    "GET",
    target,
    audience,
    timestamp,
    nonce,
  ].join("\n");
  return {
    "x-amanor-service-key-id": keyId,
    "x-amanor-service-audience": audience,
    "x-amanor-service-timestamp": timestamp,
    "x-amanor-service-nonce": nonce,
    "x-amanor-service-signature": createHmac("sha256", secret)
      .update(payload)
      .digest("base64url"),
    target,
  };
}

function context(values: ReturnType<typeof headers>): ExecutionContext {
  const request = {
    method: "GET",
    originalUrl: values.target,
    header: (name: string) => values[name.toLowerCase() as keyof typeof values],
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guard() {
  return new PublicServiceGuard(
    new ConfigService({
      NODE_ENV: "production",
      PUBLIC_WEB_SERVICE_AUDIENCE: "amanor-public-api",
      PUBLIC_WEB_SERVICE_KEYS: JSON.stringify({
        current: currentSecret,
        previous: previousSecret,
      }),
    }),
  );
}

describe("PublicServiceGuard", () => {
  it("accepts both current and previous keys during rotation", () => {
    expect(
      guard().canActivate(context(headers("current", currentSecret))),
    ).toBe(true);
    expect(
      guard().canActivate(context(headers("previous", previousSecret))),
    ).toBe(true);
  });

  it("rejects wrong audiences, expired timestamps and request-target tampering", () => {
    expect(() =>
      guard().canActivate(
        context(headers("current", currentSecret, { audience: "other" })),
      ),
    ).toThrow(UnauthorizedException);
    expect(() =>
      guard().canActivate(
        context(
          headers("current", currentSecret, {
            timestamp: String(Date.now() - 600_000),
          }),
        ),
      ),
    ).toThrow(UnauthorizedException);
    const signed = headers("current", currentSecret);
    expect(() =>
      guard().canActivate(
        context({ ...signed, target: `${signed.target}&tampered=true` }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("rejects nonce replay after a valid request", () => {
    const signed = headers("current", currentSecret);
    expect(guard().canActivate(context(signed))).toBe(true);
    expect(() => guard().canActivate(context(signed))).toThrow(/replayed/iu);
  });
});
