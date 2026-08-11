import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtKeyService } from "../application/jwt-key.service";
import { sessionIsActive } from "../domain/session";
import { AuthRepository } from "../persistence/auth.repository";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(JwtKeyService)
    private readonly jwtKeys: JwtKeyService,
    @Inject(AuthRepository)
    private readonly repository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header("authorization") ?? "";
    const [scheme, token, extra] = authorization.split(" ");
    if (scheme !== "Bearer" || !token || extra)
      throw new UnauthorizedException("Access token is invalid or expired");

    try {
      const claims = await this.jwtKeys.verify(token);
      const [session, user] = await Promise.all([
        this.repository.findBySessionId(claims.sessionId),
        this.repository.findUserById(claims.subject),
      ]);
      if (
        !session ||
        !sessionIsActive(session) ||
        session.userId !== claims.subject ||
        session.roleVersion !== claims.roleVersion ||
        !user ||
        user.disabledAt ||
        user.roleVersion !== claims.roleVersion
      ) {
        throw new Error("Session is not active");
      }
      (request as AuthenticatedRequest).auth = claims;
      return true;
    } catch {
      throw new UnauthorizedException("Access token is invalid or expired");
    }
  }
}
