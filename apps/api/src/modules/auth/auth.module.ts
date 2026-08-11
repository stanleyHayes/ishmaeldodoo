import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthService } from "./application/auth.service";
import { JwtKeyService } from "./application/jwt-key.service";
import { AuthController } from "./http/auth.controller";
import { AuthRepository } from "./persistence/auth.repository";
import {
  authEventSchema,
  sessionSchema,
  userSchema,
} from "./persistence/models";
import { AccessTokenGuard } from "./http/access-token.guard";
import { AuthRateLimitGuard } from "./http/auth-rate-limit.guard";
import { RateLimitService } from "./application/rate-limit.service";
import { AuthNotificationWorker } from "./application/auth-notification.worker";
import { HardwareKeyService } from "./application/hardware-key.service";
import { HardwareKeyRepository } from "./persistence/hardware-key.repository";
import {
  webAuthnChallengeSchema,
  webAuthnCredentialSchema,
} from "./persistence/models";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "User", schema: userSchema, collection: "users" },
      { name: "Session", schema: sessionSchema, collection: "sessions" },
      { name: "AuthEvent", schema: authEventSchema, collection: "auth_events" },
      {
        name: "WebAuthnChallenge",
        schema: webAuthnChallengeSchema,
        collection: "webauthn_challenges",
      },
      {
        name: "WebAuthnCredential",
        schema: webAuthnCredentialSchema,
        collection: "webauthn_credentials",
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtKeyService,
    AuthRepository,
    AccessTokenGuard,
    AuthRateLimitGuard,
    RateLimitService,
    AuthNotificationWorker,
    HardwareKeyService,
    HardwareKeyRepository,
  ],
  exports: [
    AuthService,
    JwtKeyService,
    AuthRepository,
    AccessTokenGuard,
    RateLimitService,
  ],
})
export class AuthModule {}
