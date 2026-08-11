import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseWebEnvironment } from "./env";

describe("public Web deployment environment", () => {
  it("normalizes distinct API and public origins", () => {
    expect(
      parseWebEnvironment({
        AMANOR_DEPLOYMENT_ENV: "staging",
        PUBLIC_API_BASE_URL: "https://api.staging.example.test/v1/",
        PUBLIC_WEB_BASE_URL: "https://www.staging.example.test/",
      }),
    ).toEqual(
      expect.objectContaining({
        AMANOR_DEPLOYMENT_ENV: "staging",
        PUBLIC_API_BASE_URL: "https://api.staging.example.test/v1",
        PUBLIC_WEB_BASE_URL: "https://www.staging.example.test",
      }),
    );
  });

  it("allows distinct loopback HTTP origins only for local development", () => {
    expect(
      parseWebEnvironment({
        PUBLIC_API_BASE_URL: "http://localhost:4000/v1",
        PUBLIC_WEB_BASE_URL: "http://localhost:3000",
      }).AMANOR_DEPLOYMENT_ENV,
    ).toBe("local");
    expect(() =>
      parseWebEnvironment({
        AMANOR_DEPLOYMENT_ENV: "preview",
        PUBLIC_API_BASE_URL: "http://localhost:4000/v1",
        PUBLIC_WEB_BASE_URL: "https://preview.example.test",
      }),
    ).toThrow(/loopback local development/u);
    expect(() =>
      parseWebEnvironment({
        PUBLIC_API_BASE_URL: "http://api.example.test/v1",
        PUBLIC_WEB_BASE_URL: "http://www.example.test",
      }),
    ).toThrow(/loopback local development/u);
  });

  it.each([
    [
      "credential-bearing API URL",
      "https://user:password@api.example.test/v1",
      "https://www.example.test",
      /prohibited/u,
    ],
    [
      "query-bearing API URL",
      "https://api.example.test/v1?token=value",
      "https://www.example.test",
      /prohibited/u,
    ],
    [
      "unversioned API URL",
      "https://api.example.test",
      "https://www.example.test",
      /end at \/v1/u,
    ],
    [
      "path-bearing public URL",
      "https://api.example.test/v1",
      "https://www.example.test/site",
      /credential-free origin/u,
    ],
    [
      "fragment-bearing public URL",
      "https://api.example.test/v1",
      "https://www.example.test/#production",
      /credential-free origin/u,
    ],
    [
      "shared Web and API origin",
      "https://www.example.test/v1",
      "https://www.example.test",
      /distinct origins/u,
    ],
  ])("rejects %s", (_name, apiUrl, webUrl, pattern) => {
    expect(() =>
      parseWebEnvironment({
        AMANOR_DEPLOYMENT_ENV: "staging",
        PUBLIC_API_BASE_URL: apiUrl,
        PUBLIC_WEB_BASE_URL: webUrl,
      }),
    ).toThrow(pattern);
  });
});
