import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { hasPermission } from "../../auth/domain/roles";
import type { AuthenticatedRequest } from "../../auth/http/authenticated-request";
import { RoomAuditService } from "../application/room-audit.service";
import { RoomConfigService } from "../application/room-config";
import { RoomDesignationService } from "../application/room-designation.service";

/**
 * Deny-by-default gate on every Room operator route. Three independent
 * conditions must all hold, and failing any of them produces the same message,
 * so a Desk Officer probing the route cannot tell whether The Room exists, who
 * holds access, or which factor they are missing.
 *
 * Runs after `AccessTokenGuard`, which has already proved the session is live
 * and the role version current.
 */
@Injectable()
export class RoomAccessGuard implements CanActivate {
  constructor(
    @Inject(RoomConfigService)
    private readonly configuration: RoomConfigService,
    @Inject(RoomDesignationService)
    private readonly designations: RoomDesignationService,
    @Inject(RoomAuditService) private readonly audit: RoomAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const claims = request.auth;
    if (!claims) throw new ForbiddenException("Room access is not permitted");

    const denied = async (): Promise<never> => {
      await this.audit.recordQuietly({
        action: "room_access_denied",
        actorId: claims.subject,
      });
      throw new ForbiddenException("Room access is not permitted");
    };

    // 1. Permission, held by the Principal's role or by an active designation.
    const permitted =
      hasPermission(claims.roles, "room:access") ||
      (await this.designations.isDesignate(claims.subject));
    if (!permitted) return denied();

    // 2. Every configured authentication factor must be present in the token's
    //    `amr`. The default is `hwk`, which the platform does not yet issue, so
    //    this fails closed until hardware-key MFA lands under AMANOR-116.
    const { requiredAuthenticationMethods } = this.configuration.read();
    // `amr` arrives as free-form strings from the token; the required set is a
    // closed union. Comparing as strings keeps the check honest without
    // asserting that an attacker-supplied claim is already well typed.
    const present = new Set<string>(claims.authenticationMethods);
    if (
      !requiredAuthenticationMethods.every((method) =>
        present.has(method as string),
      )
    ) {
      return denied();
    }

    return true;
  }
}
