import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RateLimitService } from "../auth/application/rate-limit.service";

@Injectable()
export class ContactRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = request.ip || request.socket.remoteAddress || "unknown";
    try {
      const decision = await this.limiter.consume(
        "general-contact-ip",
        ip,
        5,
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
          "Too many contact requests",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        "Contact protection is temporarily unavailable",
      );
    }
  }
}
