import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RateLimitService } from "../../auth/application/rate-limit.service";

@Injectable()
export class ProtocolDeskRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimitService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const identity = request.ip || request.socket.remoteAddress || "unknown";
    try {
      const decision = await this.limiter.consume(
        "protocol-desk-intake",
        identity,
        6,
        60 * 60 * 1_000,
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
          "Too many engagement requests",
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
