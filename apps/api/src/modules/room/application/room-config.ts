import { Injectable } from "@nestjs/common";
import {
  authenticationMethodListIsValid,
  type AuthenticationMethod,
} from "../../auth/domain/authentication-method";

export type RoomConfiguration = Readonly<{
  trustAnchorKeyId: string;
  trustAnchorPublicKey: string;
  /** Every method here must be present in the operator's `amr` claim. */
  requiredAuthenticationMethods: readonly AuthenticationMethod[];
}>;

/**
 * The Room's own configuration is validated here rather than in the shared API
 * environment schema, so enabling the channel cannot be half-configured: if
 * `ROOM_ENABLED=true` and any of these are missing or malformed, the channel
 * fails closed and never serves a key.
 *
 * It reads `process.env` rather than `ConfigService` because the shared
 * validator builds its config object from a declared class and drops every
 * undeclared key, so Room variables would silently read as `undefined`. Moving
 * these three into the shared schema is the tidier end state and is recorded as
 * a handoff; it is not done here because that file is reserved by AMANOR-120
 * and AMANOR-175.
 *
 * `ROOM_REQUIRED_AMR` defaults to `hwk`, which the platform does not yet issue.
 * That is deliberate: Room access stays closed until hardware-key MFA lands
 * under AMANOR-116, and a deployment that wants to test with a weaker factor
 * must say so explicitly and visibly.
 */
@Injectable()
export class RoomConfigService {
  private cached: RoomConfiguration | null = null;

  /** A plain field rather than a constructor parameter, so Nest has nothing to resolve. */
  private source: NodeJS.ProcessEnv = process.env;

  /** Test seam. Production never calls this. */
  readFrom(source: NodeJS.ProcessEnv): this {
    this.source = source;
    this.cached = null;
    return this;
  }

  static isEnabled(source: NodeJS.ProcessEnv = process.env): boolean {
    return source.ROOM_ENABLED === "true";
  }

  get enabled(): boolean {
    return this.source.ROOM_ENABLED === "true";
  }

  read(): RoomConfiguration {
    if (this.cached) return this.cached;

    const trustAnchorKeyId = this.source.ROOM_TRUST_ANCHOR_KEY_ID;
    const trustAnchorPublicKey = this.source.ROOM_TRUST_ANCHOR_PUBLIC_KEY;
    if (
      !trustAnchorKeyId ||
      !/^ta-[0-9a-z][0-9a-z-]{4,47}$/u.test(trustAnchorKeyId)
    ) {
      throw new Error(
        "ROOM_TRUST_ANCHOR_KEY_ID is required when The Room is enabled",
      );
    }
    if (
      !trustAnchorPublicKey ||
      !/^[A-Za-z0-9_-]{87}$/u.test(trustAnchorPublicKey)
    ) {
      throw new Error(
        "ROOM_TRUST_ANCHOR_PUBLIC_KEY must be a raw P-256 public point in base64url",
      );
    }

    const required = (this.source.ROOM_REQUIRED_AMR ?? "hwk")
      .split(",")
      .map((method) => method.trim())
      .filter((method) => method.length > 0);
    if (!authenticationMethodListIsValid(required)) {
      throw new Error(
        "ROOM_REQUIRED_AMR must contain unique supported authentication methods",
      );
    }

    this.cached = {
      trustAnchorKeyId,
      trustAnchorPublicKey,
      requiredAuthenticationMethods: required,
    };
    return this.cached;
  }
}
