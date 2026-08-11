import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("Night Economy preference route", () => {
  it("persists a valid override for one year", () => {
    const response = GET(
      new Request(
        "https://example.test/api/theme?theme=night&return=%2Frecord",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://example.test/record",
    );
    expect(response.headers.get("set-cookie")).toContain("amanor-theme=night");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=31536000");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("clears invalid/auto state and blocks open redirects", () => {
    const response = GET(
      new Request(
        "http://example.test/api/theme?theme=invalid&return=https://evil.test",
      ),
    );
    expect(response.headers.get("location")).toBe("http://example.test/");
    expect(response.headers.get("set-cookie")).toContain("amanor-theme=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
