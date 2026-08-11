// @vitest-environment node

import { describe, expect, it } from "vitest";
import { hashPassword, passwordPolicy, verifyPassword } from "./password";

describe("password hashing", () => {
  it("uses the approved minimum and verifies without storing plaintext", async () => {
    const password = "a-long-development-passphrase";
    const digest = await hashPassword(password);
    expect(digest).not.toContain(password);
    expect(await verifyPassword(password, digest)).toBe(true);
    expect(await verifyPassword("a-different-long-passphrase", digest)).toBe(
      false,
    );
    expect(passwordPolicy.bcryptCost).toBeGreaterThanOrEqual(12);
  });

  it("rejects short or excessively long passwords", async () => {
    await expect(hashPassword("too-short")).rejects.toThrow(/between/i);
    await expect(hashPassword("x".repeat(129))).rejects.toThrow(/between/i);
  });
});
