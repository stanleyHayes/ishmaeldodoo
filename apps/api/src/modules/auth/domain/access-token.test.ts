// @vitest-environment node

import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "./access-token";

const configuration = {
  issuer: "https://amanor.test",
  audience: "amanor-admin",
  keyId: "test-key-1",
};

describe("access JWTs", () => {
  it("signs and verifies the complete constrained claim set", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const token = await signAccessToken(privateKey, configuration, {
      subject: "user-1",
      sessionId: "session-1",
      roles: ["editor"],
      roleVersion: 3,
      authenticationMethods: ["pwd", "hwk"],
      stepUpAt: 1_786_291_200,
    });

    await expect(
      verifyAccessToken(token, publicKey, configuration),
    ).resolves.toEqual(
      expect.objectContaining({
        subject: "user-1",
        sessionId: "session-1",
        roleVersion: 3,
        stepUpAt: 1_786_291_200,
      }),
    );
  });

  it("rejects the wrong audience and algorithm", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const token = await signAccessToken(privateKey, configuration, {
      subject: "user-1",
      sessionId: "session-1",
      roles: ["editor"],
      roleVersion: 1,
      authenticationMethods: ["pwd"],
    });
    await expect(
      verifyAccessToken(token, publicKey, {
        ...configuration,
        audience: "different",
      }),
    ).rejects.toThrow();

    const symmetricKey = crypto.getRandomValues(new Uint8Array(32));
    const forged = await new SignJWT({
      sid: "session-1",
      roles: ["principal"],
      roleVersion: 1,
      amr: ["pwd"],
    })
      .setProtectedHeader({
        alg: "HS256",
        typ: "JWT",
        kid: configuration.keyId,
      })
      .setIssuer(configuration.issuer)
      .setAudience(configuration.audience)
      .setSubject("user-1")
      .setJti("forged")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(symmetricKey);
    await expect(
      verifyAccessToken(forged, publicKey, configuration),
    ).rejects.toThrow();
  });

  it.each([
    ["an unknown role", { roles: ["root"] }],
    ["duplicate roles", { roles: ["editor", "editor"] }],
    ["an empty subject", { sub: "" }],
    ["an empty session ID", { sid: "" }],
    ["a fractional role version", { roleVersion: 1.5 }],
    ["an empty authentication-method list", { amr: [] }],
    ["an unknown authentication method", { amr: ["pwd", "webauthn"] }],
  ])("rejects a validly signed token with %s", async (_label, overrides) => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const issuedAt = Math.floor(Date.now() / 1_000);
    const claims: Record<string, unknown> = {
      sid: "session-1",
      roles: ["editor"],
      roleVersion: 1,
      amr: ["pwd"],
      ...overrides,
    };
    const subject = typeof claims.sub === "string" ? claims.sub : "user-1";
    delete claims.sub;
    const token = await new SignJWT(claims)
      .setProtectedHeader({
        alg: "ES256",
        typ: "JWT",
        kid: configuration.keyId,
      })
      .setIssuer(configuration.issuer)
      .setAudience(configuration.audience)
      .setSubject(subject)
      .setJti("adversarial-token")
      .setIssuedAt(issuedAt)
      .setNotBefore(issuedAt)
      .setExpirationTime(issuedAt + 300)
      .sign(privateKey);

    await expect(
      verifyAccessToken(token, publicKey, configuration),
    ).rejects.toThrow("Access token claims are incomplete");
  });

  it("refuses to sign runtime claims containing an unsupported method", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    await expect(
      signAccessToken(privateKey, configuration, {
        subject: "user-1",
        sessionId: "session-1",
        roles: ["editor"],
        roleVersion: 1,
        authenticationMethods: ["pwd", "webauthn"] as never,
      }),
    ).rejects.toThrow("Access token claims are invalid");
  });

  it("rejects missing not-before and excessive token lifetimes", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const issuedAt = Math.floor(Date.now() / 1_000);
    const createToken = (includeNotBefore: boolean, lifetime: number) => {
      let token = new SignJWT({
        sid: "session-1",
        roles: ["editor"],
        roleVersion: 1,
        amr: ["pwd"],
      })
        .setProtectedHeader({
          alg: "ES256",
          typ: "JWT",
          kid: configuration.keyId,
        })
        .setIssuer(configuration.issuer)
        .setAudience(configuration.audience)
        .setSubject("user-1")
        .setJti("adversarial-token")
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + lifetime);
      if (includeNotBefore) token = token.setNotBefore(issuedAt);
      return token.sign(privateKey);
    };

    await expect(
      verifyAccessToken(
        await createToken(false, 300),
        publicKey,
        configuration,
      ),
    ).rejects.toThrow();
    await expect(
      verifyAccessToken(await createToken(true, 301), publicKey, configuration),
    ).rejects.toThrow("Access token claims are incomplete");
  });
});
