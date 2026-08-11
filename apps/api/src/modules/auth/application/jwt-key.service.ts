import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { importPKCS8, importSPKI, type CryptoKey } from "jose";
import {
  signAccessToken,
  readAccessTokenKeyId,
  verifyAccessToken,
  type AccessTokenClaims,
  type JwtConfiguration,
} from "../domain/access-token";

@Injectable()
export class JwtKeyService {
  private privateKeyPromise?: Promise<CryptoKey>;
  private readonly publicKeyPromises = new Map<string, Promise<CryptoKey>>();

  constructor(private readonly configuration: ConfigService) {}

  private config(): JwtConfiguration {
    return {
      issuer: this.configuration.getOrThrow<string>("JWT_ISSUER"),
      audience: this.configuration.getOrThrow<string>("JWT_AUDIENCE"),
      keyId: this.configuration.getOrThrow<string>("JWT_KEY_ID"),
    };
  }

  async sign(claims: AccessTokenClaims): Promise<string> {
    this.privateKeyPromise ??= importPKCS8(
      this.configuration
        .getOrThrow<string>("JWT_PRIVATE_KEY_PEM")
        .replaceAll("\\n", "\n"),
      "ES256",
    );
    return signAccessToken(await this.privateKeyPromise, this.config(), claims);
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const keyId = readAccessTokenKeyId(token);
    const configuredRing = this.configuration.get<string>(
      "JWT_VERIFICATION_KEYS",
    );
    const publicKeys = configuredRing
      ? (JSON.parse(configuredRing) as Record<string, string>)
      : {
          [this.configuration.getOrThrow<string>("JWT_KEY_ID")]:
            this.configuration.getOrThrow<string>("JWT_PUBLIC_KEY_PEM"),
        };
    const publicKeyPem = publicKeys[keyId];
    if (!publicKeyPem) throw new Error("Access token key ID is not trusted");

    let publicKeyPromise = this.publicKeyPromises.get(keyId);
    if (!publicKeyPromise) {
      publicKeyPromise = importSPKI(
        publicKeyPem.replaceAll("\\n", "\n"),
        "ES256",
      );
      this.publicKeyPromises.set(keyId, publicKeyPromise);
    }
    return verifyAccessToken(token, await publicKeyPromise, {
      ...this.config(),
      keyId,
    });
  }
}
