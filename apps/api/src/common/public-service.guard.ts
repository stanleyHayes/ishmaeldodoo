import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

const maximumClockSkewMilliseconds = 5 * 60 * 1_000;
const replayWindow = new Map<string, number>();

function signingPayload(
  method: string,
  requestTarget: string,
  audience: string,
  timestamp: string,
  nonce: string,
): string {
  return [
    "amanor-service-v1",
    method.toUpperCase(),
    requestTarget,
    audience,
    timestamp,
    nonce,
  ].join("\n");
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class PublicServiceGuard implements CanActivate {
  constructor(@Optional() private readonly configuration?: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.configuration) {
      if (process.env.NODE_ENV === "production")
        throw new UnauthorizedException(
          "Service authentication is unavailable",
        );
      return true;
    }
    const encodedKeys = this.configuration.get<string>(
      "PUBLIC_WEB_SERVICE_KEYS",
    );
    if (
      !encodedKeys &&
      this.configuration.get<string>("NODE_ENV") !== "production"
    )
      return true;
    let keys: Record<string, string>;
    try {
      keys = JSON.parse(encodedKeys ?? "{}") as Record<string, string>;
    } catch {
      throw new UnauthorizedException("Service authentication is unavailable");
    }

    const request = context.switchToHttp().getRequest<Request>();
    const keyId = request.header("x-amanor-service-key-id") ?? "";
    const audience = request.header("x-amanor-service-audience") ?? "";
    const timestamp = request.header("x-amanor-service-timestamp") ?? "";
    const nonce = request.header("x-amanor-service-nonce") ?? "";
    const signature = request.header("x-amanor-service-signature") ?? "";
    const expectedAudience =
      this.configuration.get<string>("PUBLIC_WEB_SERVICE_AUDIENCE") ??
      "amanor-public-api";
    const timestampMilliseconds = Number(timestamp);
    const now = Date.now();
    const secret = keys[keyId];
    if (
      !secret ||
      audience !== expectedAudience ||
      !/^[a-f0-9-]{36}$/iu.test(nonce) ||
      !Number.isFinite(timestampMilliseconds) ||
      Math.abs(now - timestampMilliseconds) > maximumClockSkewMilliseconds
    ) {
      throw new UnauthorizedException("Invalid service credential");
    }
    for (const [key, expiresAt] of replayWindow)
      if (expiresAt <= now) replayWindow.delete(key);
    const replayKey = `${keyId}:${nonce}`;
    if (replayWindow.has(replayKey))
      throw new UnauthorizedException("Service request replayed");
    const requestTarget = request.originalUrl;
    const expected = createHmac("sha256", secret)
      .update(
        signingPayload(
          request.method,
          requestTarget,
          audience,
          timestamp,
          nonce,
        ),
      )
      .digest("base64url");
    if (!equal(signature, expected))
      throw new UnauthorizedException("Invalid service credential");
    replayWindow.set(replayKey, now + maximumClockSkewMilliseconds);
    return true;
  }
}
