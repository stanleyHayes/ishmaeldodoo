import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("Sahel preference route", () => {
  it("sets the persistent mode and a shareable lite parameter", () => {
    const response = GET(
      new Request("https://example.test/api/sahel?enabled=1&return=%2Frecord"),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://example.test/record?lite=1",
    );
    expect(response.headers.get("set-cookie")).toContain("amanor-sahel=1");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=2592000");
  });

  it("records explicit dismissal, strips lite and rejects an unsafe return", () => {
    const response = GET(
      new Request(
        "http://example.test/api/sahel?enabled=0&return=https://evil.test/%3Flite%3D1",
      ),
    );
    expect(response.headers.get("location")).toBe("http://example.test/");
    expect(response.headers.get("set-cookie")).toContain(
      "amanor-sahel=dismissed",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=2592000");
  });
});
