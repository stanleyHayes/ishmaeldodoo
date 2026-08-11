import { describe, expect, it } from "vitest";
import { signRevalidationRequest } from "./revalidation-signature";

describe("revalidation request signature", () => {
  it("binds the timestamp and exact body bytes to the shared secret", () => {
    const signature = signRevalidationRequest(
      "current",
      "amanor-public-web",
      "1786300000000",
      '{"tags":["content"]}',
      "a-revalidation-secret-that-is-long-enough",
    );
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(
      signRevalidationRequest(
        "current",
        "amanor-public-web",
        "1786300000001",
        '{"tags":["content"]}',
        "a-revalidation-secret-that-is-long-enough",
      ),
    ).not.toBe(signature);
    expect(
      signRevalidationRequest(
        "current",
        "amanor-public-web",
        "1786300000000",
        '{"tags":["content:page"]}',
        "a-revalidation-secret-that-is-long-enough",
      ),
    ).not.toBe(signature);
    expect(
      signRevalidationRequest(
        "previous",
        "amanor-public-web",
        "1786300000000",
        '{"tags":["content"]}',
        "a-revalidation-secret-that-is-long-enough",
      ),
    ).not.toBe(signature);
    expect(
      signRevalidationRequest(
        "current",
        "other-audience",
        "1786300000000",
        '{"tags":["content"]}',
        "a-revalidation-secret-that-is-long-enough",
      ),
    ).not.toBe(signature);
  });
});
