import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptMfaSecret,
  decryptMfaSecretWithKeys,
  encryptMfaSecret,
  generateTotpForTesting,
  verifyTotp,
} from "./mfa";

describe("TOTP MFA", () => {
  it("encrypts secrets at rest and verifies only the valid time window", () => {
    const key = randomBytes(32).toString("base64");
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptMfaSecret(secret, key);
    expect(encrypted.encryptedSecret).not.toContain(secret);
    expect(decryptMfaSecret(encrypted, key)).toBe(secret);

    const now = new Date("2026-08-09T18:00:00Z");
    const code = generateTotpForTesting(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, "000000", now)).toBe(false);
    expect(verifyTotp(secret, code, new Date(now.getTime() + 120_000))).toBe(
      false,
    );
  });

  it("identifies a retiring encryption key through authenticated decryption", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const activeKey = Buffer.alloc(32, 2).toString("base64");
    const retiringKey = Buffer.alloc(32, 3).toString("base64");
    const encrypted = encryptMfaSecret(secret, retiringKey);

    expect(
      decryptMfaSecretWithKeys(encrypted, [activeKey, retiringKey]),
    ).toEqual({ secret, keyIndex: 1 });
    expect(() => decryptMfaSecretWithKeys(encrypted, [activeKey])).toThrow(
      /trusted key/u,
    );
  });
});
