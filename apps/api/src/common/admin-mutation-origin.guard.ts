import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { assertTrustedMutationOrigin } from "../modules/auth/application/request-security";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class AdminMutationOriginGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configuration: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (safeMethods.has(request.method.toUpperCase())) return true;
    try {
      assertTrustedMutationOrigin(
        request.header("origin") ?? null,
        this.configuration.getOrThrow<string>("ADMIN_ORIGIN"),
      );
      return true;
    } catch {
      throw new ForbiddenException("Mutation request is not permitted");
    }
  }
}
