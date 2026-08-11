import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("locale proxy", () => {
  it("redirects a first French-preferring root request and persists the negotiation", () => {
    const response = proxy(
      new NextRequest("https://example.test/", {
        headers: { "accept-language": "fr-FR,fr;q=0.9" },
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.test/fr");
    expect(response.cookies.get("amanor_locale")?.value).toBe("fr-FR");
    expect(response.headers.get("vary")).toContain("Accept-Language");
  });

  it("never overrides an explicit stored choice", () => {
    const response = proxy(
      new NextRequest("https://example.test/", {
        headers: {
          "accept-language": "fr-FR",
          cookie: "amanor_locale=en-GB",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("forwards locale and pathname context to server layouts", () => {
    const response = proxy(
      new NextRequest("https://example.test/fr/record", {
        headers: { cookie: "amanor-theme=day" },
      }),
    );
    expect(response.headers.get("x-middleware-request-x-amanor-locale")).toBe(
      "fr-FR",
    );
    expect(response.headers.get("x-middleware-request-x-amanor-pathname")).toBe(
      "/fr/record",
    );
    expect(response.headers.get("x-middleware-request-x-amanor-theme")).toBe(
      "day",
    );
    expect(
      response.headers.get("x-middleware-request-x-amanor-theme-preference"),
    ).toBe("day");
  });

  it("persists query Sahel mode and forwards request context", () => {
    const response = proxy(
      new NextRequest("https://example.test/record?lite=1"),
    );
    expect(response.status).toBe(200);
    expect(response.cookies.get("amanor-sahel")?.value).toBe("1");
    expect(response.headers.get("x-middleware-request-x-amanor-sahel")).toBe(
      "1",
    );
  });

  it("renders query Sahel mode without mutating preference during RSC prefetch", () => {
    const response = proxy(
      new NextRequest("https://example.test/record?lite=1", {
        headers: {
          cookie: "amanor-sahel=dismissed",
          "next-router-prefetch": "1",
          rsc: "1",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-amanor-sahel")).toBe(
      "1",
    );
    expect(response.cookies.get("amanor-sahel")).toBeUndefined();
  });

  it("lets explicit mode queries win but never lets stored mode override dismissal", () => {
    const dismissed = proxy(
      new NextRequest("https://example.test/", {
        headers: {
          cookie: "amanor-sahel=dismissed",
        },
      }),
    );
    expect(dismissed.headers.get("x-middleware-request-x-amanor-sahel")).toBe(
      "0",
    );

    const explicit = proxy(
      new NextRequest("https://example.test/?lite=1", {
        headers: {
          cookie: "amanor-sahel=dismissed",
        },
      }),
    );
    expect(explicit.headers.get("x-middleware-request-x-amanor-sahel")).toBe(
      "1",
    );
  });

  it("serves the Sahel homepage with a complete no-script policy", () => {
    const response = proxy(new NextRequest("https://example.test/?lite=1"));
    const policy = response.headers.get("content-security-policy");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'self'");
  });

  it("serves the progressively enhanced Sahel Press Room without scripts", () => {
    const response = proxy(
      new NextRequest("https://example.test/press?lite=1"),
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'none'",
    );
    const contact = proxy(
      new NextRequest("https://example.test/press/contact?lite=1"),
    );
    expect(contact.headers.get("content-security-policy")).toBeNull();
  });

  it("serves the Atlas table twin by default in persistent Sahel mode", () => {
    const response = proxy(
      new NextRequest("https://example.test/fr/record/atlas?theme=financing", {
        headers: { cookie: "amanor-sahel=1" },
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.test/fr/record/atlas/table?theme=financing&lite=1",
    );
  });

  it("allows an explicit interactive-map opt-in without losing Sahel context", () => {
    const response = proxy(
      new NextRequest("https://example.test/record/atlas?map=1", {
        headers: { cookie: "amanor-sahel=1" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-amanor-sahel")).toBe(
      "1",
    );
  });
});
