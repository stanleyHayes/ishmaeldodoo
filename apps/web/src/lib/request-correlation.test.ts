import { describe, expect, it, vi } from "vitest";
import {
  correlationRequestHeaders,
  correlationResponseHeaders,
  requestCorrelation,
} from "./request-correlation";

const incomingTrace = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const apiTrace = "00-4bf92f3577b34da6a3ce929d0e0e4736-7f3a9c18d561b277-01";

describe("Web request correlation", () => {
  it("preserves a safe request ID and W3C trace for a downstream API call", () => {
    const correlation = requestCorrelation(
      new Request("https://www.amanor.test/api/protocol-desk", {
        headers: {
          "X-Request-ID": "web.request-42",
          traceparent: incomingTrace,
        },
      }),
    );
    expect(correlationRequestHeaders(correlation)).toEqual({
      "X-Request-ID": "web.request-42",
      traceparent: incomingTrace,
    });
  });

  it("replaces malformed or all-zero untrusted identifiers", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "12345678-1234-4123-8123-123456789abc",
    );
    const correlation = requestCorrelation(
      new Request("https://www.amanor.test/api/protocol-desk", {
        headers: {
          "X-Request-ID": "unsafe request value",
          traceparent:
            "00-00000000000000000000000000000000-0000000000000000-01",
        },
      }),
    );
    expect(correlation.requestId).toBe("12345678-1234-4123-8123-123456789abc");
    expect(correlation.traceparent).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/u,
    );
    expect(correlation.traceparent).not.toContain(
      "-00000000000000000000000000000000-",
    );
  });

  it("returns the API child span without accepting malformed upstream metadata", () => {
    const correlation = {
      requestId: "web.request-42",
      traceparent: incomingTrace,
    };
    expect(
      correlationResponseHeaders(
        correlation,
        new Response(null, {
          headers: { "X-Request-ID": "web.request-42", traceparent: apiTrace },
        }),
      ),
    ).toEqual({ "X-Request-ID": "web.request-42", traceparent: apiTrace });
    expect(
      correlationResponseHeaders(
        correlation,
        new Response(null, {
          headers: { "X-Request-ID": "bad id", traceparent: "invalid" },
        }),
      ),
    ).toEqual({ "X-Request-ID": "web.request-42", traceparent: incomingTrace });
  });
});
