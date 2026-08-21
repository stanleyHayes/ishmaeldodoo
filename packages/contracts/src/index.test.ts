import { describe, expect, it } from "vitest";
import {
  adminSessionSchema,
  authenticationMethods,
  httpsUrlSchema,
  loginRequestSchema,
  resolveDateRangedRecord,
} from "./index";

describe("resolveDateRangedRecord", () => {
  it("selects the latest record valid at the requested instant", () => {
    const records = [
      { id: "past", from: "2020-01-01", to: "2023-12-31" },
      { id: "future", from: "2030-01-01", to: null },
      { id: "current", from: "2024-01-01", to: "2029-12-31" },
    ] as const;

    expect(
      resolveDateRangedRecord(records, new Date("2026-08-10T00:00:00Z"))?.id,
    ).toBe("current");
  });

  it("returns undefined when no record is valid", () => {
    expect(
      resolveDateRangedRecord(
        [{ from: "2030-01-01", to: null }],
        new Date("2026-08-10T00:00:00Z"),
      ),
    ).toBeUndefined();
  });
});

describe("authentication-method contracts", () => {
  const session = {
    sessionId: "session-1",
    familyId: "family-1",
    authenticationMethods: ["pwd", "totp"],
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    current: true,
  };

  it("publishes one exact method vocabulary and rejects unknown or duplicate values", () => {
    expect(authenticationMethods).toEqual([
      "pwd",
      "totp",
      "recovery",
      "step_up",
      "hwk",
    ]);
    expect(adminSessionSchema.safeParse(session).success).toBe(true);
    expect(
      adminSessionSchema.safeParse({
        ...session,
        authenticationMethods: ["pwd", "webauthn"],
      }).success,
    ).toBe(false);
    expect(
      adminSessionSchema.safeParse({
        ...session,
        authenticationMethods: ["pwd", "pwd"],
      }).success,
    ).toBe(false);
  });
});

describe("staged administrator login contract", () => {
  it("accepts credentials and MFA as separate stages and rejects a combined payload", () => {
    expect(
      loginRequestSchema.safeParse({
        stage: "credentials",
        email: "editor@example.test",
        password: "a-long-development-passphrase",
      }).success,
    ).toBe(true);
    expect(
      loginRequestSchema.safeParse({
        stage: "verification",
        challenge: "a".repeat(64),
        mfaCode: "123456",
      }).success,
    ).toBe(true);
    expect(
      loginRequestSchema.safeParse({
        stage: "credentials",
        email: "editor@example.test",
        password: "a-long-development-passphrase",
        mfaCode: "123456",
      }).success,
    ).toBe(false);
  });
});

describe("public HTTPS URL contract", () => {
  it("accepts credential-free HTTPS and rejects unsafe schemes or embedded credentials", () => {
    expect(
      httpsUrlSchema.safeParse("https://example.test/evidence").success,
    ).toBe(true);
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://example.test/archive",
      "http://example.test/plaintext",
      "https://operator@example.test/private",
      "https://operator:secret@example.test/private",
      "https://operator%40example.test:secret@example.test/private",
    ])
      expect(httpsUrlSchema.safeParse(value).success, value).toBe(false);
  });
});
