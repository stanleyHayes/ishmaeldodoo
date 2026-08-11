// @vitest-environment node

import { ConfigService } from "@nestjs/config";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import {
  signAccessToken,
  type AccessTokenClaims,
} from "../domain/access-token";
import { JwtKeyService } from "./jwt-key.service";

const claims = {
  subject: "user-1",
  sessionId: "session-1",
  roles: ["editor" as const],
  roleVersion: 1,
  authenticationMethods: ["pwd"],
} satisfies AccessTokenClaims;

describe("JwtKeyService rotation", () => {
  it("signs with the active key and verifies active and retiring tokens", async () => {
    const active = await generateKeyPair("ES256", { extractable: true });
    const retiring = await generateKeyPair("ES256", { extractable: true });
    const values = {
      JWT_ISSUER: "https://api.amanor.test",
      JWT_AUDIENCE: "amanor-admin",
      JWT_KEY_ID: "active-2026-08",
      JWT_PRIVATE_KEY_PEM: await exportPKCS8(active.privateKey),
      JWT_PUBLIC_KEY_PEM: await exportSPKI(active.publicKey),
      JWT_VERIFICATION_KEYS: JSON.stringify({
        "active-2026-08": await exportSPKI(active.publicKey),
        "retiring-2026-07": await exportSPKI(retiring.publicKey),
      }),
    };
    const service = new JwtKeyService(new ConfigService(values));
    const activeToken = await service.sign(claims);
    const retiringToken = await signAccessToken(
      retiring.privateKey,
      {
        issuer: values.JWT_ISSUER,
        audience: values.JWT_AUDIENCE,
        keyId: "retiring-2026-07",
      },
      claims,
    );

    await expect(service.verify(activeToken)).resolves.toMatchObject(claims);
    await expect(service.verify(retiringToken)).resolves.toMatchObject(claims);
  });

  it("rejects an unknown key ID even when its signature is valid", async () => {
    const active = await generateKeyPair("ES256", { extractable: true });
    const unknown = await generateKeyPair("ES256");
    const values = {
      JWT_ISSUER: "https://api.amanor.test",
      JWT_AUDIENCE: "amanor-admin",
      JWT_KEY_ID: "active",
      JWT_PRIVATE_KEY_PEM: await exportPKCS8(active.privateKey),
      JWT_PUBLIC_KEY_PEM: await exportSPKI(active.publicKey),
      JWT_VERIFICATION_KEYS: JSON.stringify({
        active: await exportSPKI(active.publicKey),
      }),
    };
    const token = await signAccessToken(
      unknown.privateKey,
      {
        issuer: values.JWT_ISSUER,
        audience: values.JWT_AUDIENCE,
        keyId: "unknown",
      },
      claims,
    );

    await expect(
      new JwtKeyService(new ConfigService(values)).verify(token),
    ).rejects.toThrow(/not trusted/u);
  });
});
