import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("audience preference route", () => {
  it("persists an approved door and redirects to the shareable view", () => {
    const response = GET(
      new Request(
        "https://example.test/api/audience?door=investor&return=/%3Fdoor%3Dinvestor",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://example.test/?door=investor",
    );
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("amanor-audience=investor;");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Secure");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("clears the preference and rejects external return locations", () => {
    const response = GET(
      new Request(
        "http://example.test/api/audience?door=unknown&return=https://evil.test",
      ),
    );
    expect(response.headers.get("location")).toBe("http://example.test/");
    expect(response.headers.get("set-cookie")).toContain("amanor-audience=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
