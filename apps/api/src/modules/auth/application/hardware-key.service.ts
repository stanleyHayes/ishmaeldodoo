import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { AccessTokenClaims } from "../domain/access-token";
import type { AuthenticationMethod } from "../domain/authentication-method";
import { AuthService } from "./auth.service";
import { JwtKeyService } from "./jwt-key.service";
import {
  HardwareKeyRepository,
  type HardwareKeyCeremony,
} from "../persistence/hardware-key.repository";

const ceremonyLifetimeMs = 5 * 60 * 1_000;

@Injectable()
export class HardwareKeyService {
  constructor(
    private readonly repository: HardwareKeyRepository,
    private readonly auth: AuthService,
    private readonly jwtKeys: JwtKeyService,
    private readonly configuration: ConfigService,
  ) {}

  async registrationOptions(
    claims: AccessTokenClaims,
    now = new Date(),
  ): Promise<unknown> {
    this.assertEnabled();
    this.assertRecentTotp(claims, now);
    const user = await this.auth.findActiveUserForHardwareKey(claims.subject);
    const credentials = await this.repository.list(claims.subject);
    const options = await generateRegistrationOptions({
      rpName: this.configuration.getOrThrow("WEBAUTHN_RP_NAME"),
      rpID: this.configuration.getOrThrow("WEBAUTHN_RP_ID"),
      userName: user.emailCanonical,
      userDisplayName: user.emailCanonical,
      userID: new TextEncoder().encode(user.userId),
      attestationType: "none",
      preferredAuthenticatorType: "securityKey",
      authenticatorSelection: {
        residentKey: "discouraged",
        userVerification: "required",
      },
      supportedAlgorithmIDs: [-7, -257],
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as AuthenticatorTransportFuture[],
      })),
      timeout: ceremonyLifetimeMs,
    });
    const ceremonyId = randomUUID();
    await this.repository.createCeremony({
      ceremonyId,
      userId: claims.subject,
      sessionId: claims.sessionId,
      purpose: "registration",
      challengeHash: this.hash(options.challenge),
      expiresAt: new Date(now.getTime() + ceremonyLifetimeMs),
    });
    return { ceremonyId, options };
  }

  async verifyRegistration(
    claims: AccessTokenClaims,
    ceremonyId: string,
    response: RegistrationResponseJSON,
    label: string,
    now = new Date(),
  ): Promise<unknown> {
    this.assertEnabled();
    this.assertRecentTotp(claims, now);
    const ceremony = await this.ceremony(
      ceremonyId,
      claims,
      "registration",
      now,
    );
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: (challenge) =>
        this.matches(ceremony.challengeHash, challenge),
      expectedOrigin: this.configuration.getOrThrow("WEBAUTHN_ORIGIN"),
      expectedRPID: this.configuration.getOrThrow("WEBAUTHN_RP_ID"),
      requireUserPresence: true,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
    if (!result.verified)
      throw new UnauthorizedException("Hardware-key registration failed");
    const info = result.registrationInfo;
    if (
      !(await this.repository.register(
        ceremony,
        {
          credentialId: info.credential.id,
          userId: claims.subject,
          webAuthnUserId: Buffer.from(claims.subject).toString("base64url"),
          publicKey: Buffer.from(info.credential.publicKey),
          counter: info.credential.counter,
          transports: info.credential.transports ?? [],
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
          aaguid: info.aaguid,
          label,
        },
        now,
      ))
    )
      throw new UnauthorizedException(
        "Hardware-key ceremony is no longer valid",
      );
    await this.auth.recordHardwareKeyEvent(
      "hardware_key_enrolled",
      claims,
      now,
    );
    return {
      credentialId: info.credential.id,
      label,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      transports: info.credential.transports ?? [],
      createdAt: now,
    };
  }

  async authenticationOptions(
    claims: AccessTokenClaims,
    now = new Date(),
  ): Promise<unknown> {
    this.assertEnabled();
    const credentials = await this.repository.list(claims.subject);
    if (credentials.length === 0)
      throw new NotFoundException("No hardware key is enrolled");
    const options = await generateAuthenticationOptions({
      rpID: this.configuration.getOrThrow("WEBAUTHN_RP_ID"),
      userVerification: "required",
      timeout: ceremonyLifetimeMs,
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as AuthenticatorTransportFuture[],
      })),
    });
    const ceremonyId = randomUUID();
    await this.repository.createCeremony({
      ceremonyId,
      userId: claims.subject,
      sessionId: claims.sessionId,
      purpose: "authentication",
      challengeHash: this.hash(options.challenge),
      expiresAt: new Date(now.getTime() + ceremonyLifetimeMs),
    });
    return { ceremonyId, options };
  }

  async verifyAuthentication(
    claims: AccessTokenClaims,
    ceremonyId: string,
    response: AuthenticationResponseJSON,
    now = new Date(),
  ): Promise<Readonly<{ accessToken: string; expiresIn: 300 }>> {
    this.assertEnabled();
    const ceremony = await this.ceremony(
      ceremonyId,
      claims,
      "authentication",
      now,
    );
    const credential = await this.repository.find(claims.subject, response.id);
    if (!credential)
      throw new UnauthorizedException("Hardware-key authentication failed");
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (challenge) =>
        this.matches(ceremony.challengeHash, challenge),
      expectedOrigin: this.configuration.getOrThrow("WEBAUTHN_ORIGIN"),
      expectedRPID: this.configuration.getOrThrow("WEBAUTHN_RP_ID"),
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: true,
    });
    if (
      !result.verified ||
      !(await this.repository.authenticate(
        ceremony,
        credential,
        result.authenticationInfo.newCounter,
        now,
      ))
    )
      throw new UnauthorizedException("Hardware-key authentication failed");
    const methods = Array.from(
      new Set<AuthenticationMethod>([
        ...claims.authenticationMethods,
        "hwk",
        "step_up",
      ]),
    );
    const accessToken = await this.jwtKeys.sign({
      ...claims,
      authenticationMethods: methods,
      stepUpAt: Math.floor(now.getTime() / 1_000),
    });
    await this.auth.recordHardwareKeyEvent(
      "hardware_key_authenticated",
      claims,
      now,
    );
    return { accessToken, expiresIn: 300 as const };
  }

  async list(claims: AccessTokenClaims): Promise<readonly unknown[]> {
    this.assertEnabled();
    return (await this.repository.list(claims.subject)).map(
      ({
        credentialId,
        label,
        deviceType,
        backedUp,
        transports,
        createdAt,
        lastUsedAt,
      }) => ({
        credentialId,
        label,
        deviceType,
        backedUp,
        transports,
        createdAt,
        ...(lastUsedAt ? { lastUsedAt } : {}),
      }),
    );
  }

  async revoke(
    claims: AccessTokenClaims,
    credentialId: string,
    now = new Date(),
  ): Promise<void> {
    this.assertEnabled();
    this.assertRecentTotp(claims, now);
    if (!(await this.repository.revoke(claims.subject, credentialId, now)))
      throw new NotFoundException("Hardware key was not found");
    await this.auth.recordHardwareKeyEvent("hardware_key_revoked", claims, now);
  }

  private assertEnabled(): void {
    if (this.configuration.get("WEBAUTHN_ENABLED") !== "true")
      throw new NotFoundException();
  }
  private assertRecentTotp(claims: AccessTokenClaims, now: Date): void {
    if (
      !claims.authenticationMethods.includes("totp") ||
      !claims.authenticationMethods.includes("step_up") ||
      !claims.stepUpAt ||
      now.getTime() / 1_000 - claims.stepUpAt > 300
    )
      throw new ForbiddenException("Recent TOTP verification is required");
  }
  private async ceremony(
    id: string,
    claims: AccessTokenClaims,
    purpose: "registration" | "authentication",
    now: Date,
  ): Promise<HardwareKeyCeremony> {
    const ceremony = await this.repository.findCeremony(id);
    if (
      !ceremony ||
      ceremony.userId !== claims.subject ||
      ceremony.sessionId !== claims.sessionId ||
      ceremony.purpose !== purpose ||
      ceremony.usedAt ||
      ceremony.expiresAt <= now
    )
      throw new UnauthorizedException(
        "Hardware-key ceremony is invalid or expired",
      );
    return ceremony;
  }
  private hash(challenge: string): string {
    return createHash("sha256").update(challenge).digest("base64url");
  }
  private matches(expected: string, challenge: string): boolean {
    const actual = this.hash(challenge);
    return (
      expected.length === actual.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    );
  }
}
