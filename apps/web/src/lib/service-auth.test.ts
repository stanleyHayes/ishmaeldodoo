import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { serviceAuthHeaders, serviceSigningPayload } from "./service-auth";

describe("serviceAuthHeaders", () => {
  it("binds the key, audience and signature to the exact request target", () => {
    const url = new URL(
      "https://api.example.test/v1/public/atlas?locale=fr-FR",
    );
    const secret = "service-secret-with-at-least-thirty-two-bytes";
    const headers = serviceAuthHeaders(url, {
      keyId: "web-current",
      secret,
      audience: "amanor-public-api",
    });
    const expected = createHmac("sha256", secret)
      .update(
        serviceSigningPayload({
          method: "GET",
          requestTarget: `${url.pathname}${url.search}`,
          audience: headers["X-Amanor-Service-Audience"]!,
          timestamp: headers["X-Amanor-Service-Timestamp"]!,
          nonce: headers["X-Amanor-Service-Nonce"]!,
        }),
      )
      .digest("base64url");
    expect(headers["X-Amanor-Service-Key-Id"]).toBe("web-current");
    expect(headers["X-Amanor-Service-Signature"]).toBe(expected);
  });

  it("emits only correlation metadata when service authentication is unconfigured", () => {
    expect(
      serviceAuthHeaders(new URL("http://localhost/v1/public/atlas")),
    ).toEqual({
      "X-Request-ID": expect.stringMatching(/^[0-9a-f-]{36}$/u),
      traceparent: expect.stringMatching(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/u),
    });
  });

  it("preserves a validated Web request correlation chain", () => {
    const correlation = {
      requestId: "web.request-42",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    };
    expect(
      serviceAuthHeaders(
        new URL("http://localhost/v1/public/room/key-manifest"),
        undefined,
        "GET",
        correlation,
      ),
    ).toEqual({
      "X-Request-ID": correlation.requestId,
      traceparent: correlation.traceparent,
    });
  });
});
