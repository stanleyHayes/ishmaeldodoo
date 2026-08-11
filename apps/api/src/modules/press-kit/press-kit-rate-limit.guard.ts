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
export class PressKitRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimitService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = request.ip || request.socket.remoteAddress || "unknown";
    const policy = request.path.includes("/media-enquiries")
      ? { namespace: "media-enquiry-ip", limit: 5 }
      : request.path.includes("/living-dossier")
        ? { namespace: "living-dossier-ip", limit: 5 }
        : { namespace: "press-kit-ip", limit: 10 };
    try {
      const decision = await this.limiter.consume(
        policy.namespace,
        ip,
        policy.limit,
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
          "Too many public document or media requests",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        "Public request protection is temporarily unavailable",
      );
    }
  }
}
