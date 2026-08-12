import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  mixin,
  type Type,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RateLimitService } from "../../auth/application/rate-limit.service";

const HOUR_MS = 60 * 60 * 1_000;

function createProtocolDeskRateLimitGuard(
  options: Readonly<{
    bucket: string;
    limit: number;
    windowMs: number;
    message: string;
  }>,
): Type<CanActivate> {
  @Injectable()
  class ProtocolDeskRateLimit implements CanActivate {
    constructor(private readonly limiter: RateLimitService) {}
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<Request>();
      const response = context.switchToHttp().getResponse<Response>();
      const identity = request.ip || request.socket.remoteAddress || "unknown";
      try {
        const decision = await this.limiter.consume(
          options.bucket,
          identity,
          options.limit,
          options.windowMs,
        );
        response.setHeader(
          "X-RateLimit-Remaining",
          decision.remaining.toString(),
        );
        if (!decision.allowed) {
          response.setHeader(
            "Retry-After",
            decision.retryAfterSeconds.toString(),
          );
          throw new HttpException(
            options.message,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return true;
      } catch (error) {
        if (error instanceof HttpException) throw error;
        throw new ServiceUnavailableException(
          "Protocol Desk protection is temporarily unavailable",
        );
      }
    }
  }
  return mixin(ProtocolDeskRateLimit);
}

// Public bilingual engagement intake: conservative per-IP anti-spam budget.
export const ProtocolDeskRateLimitGuard = createProtocolDeskRateLimitGuard({
  bucket: "protocol-desk-intake",
  limit: 6,
  windowMs: HOUR_MS,
  message: "Too many engagement requests",
});

// Public capability-token decision callback: unauthenticated and state-mutating
// (it consumes a decision token and transitions engagement state), so it carries
// its own per-IP budget, separate from intake, to bound abuse and database load.
// The 256-bit single-use decision token remains the primary access control; this
// limit is defence-in-depth against resource exhaustion and token fuzzing.
export const ProtocolDeskDecisionRateLimitGuard =
  createProtocolDeskRateLimitGuard({
    bucket: "protocol-desk-decision",
    limit: 20,
    windowMs: HOUR_MS,
    message: "Too many decision attempts",
  });
