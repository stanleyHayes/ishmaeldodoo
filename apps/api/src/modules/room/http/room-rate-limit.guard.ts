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

/**
 * A dedicated quota namespace for The Room, so ordinary contact-form abuse
 * cannot exhaust the confidential channel and vice versa.
 *
 * The limiter HMACs the identifier with a server pepper before storage, so no
 * raw client IP is written anywhere. Unlike the public forms, this guard emits
 * no `X-RateLimit-Remaining` header: a remaining-count oracle would let an
 * observer probe whether anyone else is using the channel.
 */
@Injectable()
export class RoomRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = request.ip || request.socket.remoteAddress || "unknown";
    try {
      const decision = await this.limiter.consume(
        "room-submission-ip",
        ip,
        3,
        60 * 60 * 1_000,
      );
      if (!decision.allowed) {
        response.setHeader(
          "Retry-After",
          decision.retryAfterSeconds.toString(),
        );
        throw new HttpException(
          "Too many requests",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Fail closed. An unavailable limiter must not become an open door on the
      // one channel where volume abuse is most damaging.
      throw new ServiceUnavailableException(
        "The confidential channel is temporarily unavailable",
      );
    }
  }
}
