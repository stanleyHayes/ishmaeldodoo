import { describe, expect, it } from "vitest";
import {
  assertCsrfProof,
  assertTrustedMutationOrigin,
  csrfTokenHash,
  refreshCookiePolicy,
} from "./request-security";

describe("cookie mutation security", () => {
  it("uses a host-only secure HttpOnly strict refresh cookie", () => {
    expect(refreshCookiePolicy).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/v1/auth",
      }),
    );
    expect(refreshCookiePolicy).not.toHaveProperty("domain");
  });

  it("requires an exact trusted origin", () => {
    expect(() =>
      assertTrustedMutationOrigin(
        "https://admin.example.com",
        "https://admin.example.com",
      ),
    ).not.toThrow();
    expect(() =>
      assertTrustedMutationOrigin(
        "https://evil.example",
        "https://admin.example.com",
      ),
    ).toThrow(/trusted/i);
    expect(() =>
      assertTrustedMutationOrigin(null, "https://admin.example.com"),
    ).toThrow(/required/i);
  });

  it("requires matching cookie/header CSRF proof bound to the session hash", () => {
    const token = "csrf-proof-value";
    expect(() =>
      assertCsrfProof(token, token, csrfTokenHash(token)),
    ).not.toThrow();
    expect(() =>
      assertCsrfProof(token, "different", csrfTokenHash(token)),
    ).toThrow(/mismatched/i);
    expect(() => assertCsrfProof(token, token, csrfTokenHash("other"))).toThrow(
      /invalid/i,
    );
  });
});
