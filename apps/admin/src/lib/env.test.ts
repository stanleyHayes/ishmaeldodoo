import { describe, expect, it } from "vitest";
import { parseAdminEnvironment } from "./env";

describe("Admin deployment environment", () => {
  it("normalizes the explicit API v1 boundary", () => {
    expect(
      parseAdminEnvironment({
        NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV: "staging",
        NEXT_PUBLIC_API_BASE_URL: "https://api.staging.example.test/v1/",
      }),
    ).toEqual({
      deploymentEnvironment: "staging",
      apiBaseUrl: "https://api.staging.example.test/v1",
      apiOrigin: "https://api.staging.example.test",
    });
  });

  it("allows loopback HTTP only for local development", () => {
    expect(
      parseAdminEnvironment({
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/v1",
      }).deploymentEnvironment,
    ).toBe("local");
    expect(() =>
      parseAdminEnvironment({
        NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV: "preview",
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/v1",
      }),
    ).toThrow(/non-loopback HTTPS/u);
  });

  it.each([
    ["unknown environment", "qa", "https://api.example.test/v1", /invalid/u],
    ["relative URL", "production", "/v1", /absolute URL/u],
    [
      "credential-bearing URL",
      "production",
      "https://user:password@api.example.test/v1",
      /prohibited/u,
    ],
    [
      "query-bearing URL",
      "production",
      "https://api.example.test/v1?token=value",
      /prohibited/u,
    ],
    [
      "unversioned URL",
      "production",
      "https://api.example.test",
      /end at \/v1/u,
    ],
    [
      "wrong API version",
      "production",
      "https://api.example.test/v2",
      /end at \/v1/u,
    ],
  ])("rejects %s", (_name, deployment, url, pattern) => {
    expect(() =>
      parseAdminEnvironment({
        NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV: deployment,
        NEXT_PUBLIC_API_BASE_URL: url,
      }),
    ).toThrow(pattern);
  });
});
