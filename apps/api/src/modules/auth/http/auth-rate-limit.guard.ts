import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RateLimitService } from "../application/rate-limit.service";

type LoginBody = Readonly<{ email?: unknown }>;

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = request.ip || request.socket.remoteAddress || "unknown";
    const isLogin = request.path.endsWith("/login");
    try {
      const decisions = isLogin
        ? await Promise.all([
            this.limiter.consume("auth-login-ip", ip, 30, 15 * 60 * 1_000),
            this.limiter.consume(
              "auth-login-principal",
              `${ip}:${this.canonicalEmail(request.body)}`,
              5,
              15 * 60 * 1_000,
            ),
          ])
        : [await this.limiter.consume("auth-refresh-ip", ip, 60, 60 * 1_000)];
      const rejected = decisions.find((decision) => !decision.allowed);
      if (rejected) {
        response.setHeader(
          "Retry-After",
          rejected.retryAfterSeconds.toString(),
        );
        throw new HttpException(
          "Too many authentication attempts",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      response.setHeader(
        "X-RateLimit-Remaining",
        Math.min(...decisions.map((decision) => decision.remaining)).toString(),
      );
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        "Authentication protection is temporarily unavailable",
      );
    }
  }

  private canonicalEmail(body: unknown): string {
    const email = (body as LoginBody | null)?.email;
    return typeof email === "string"
      ? email.trim().toLowerCase().slice(0, 254)
      : "invalid";
  }
}
