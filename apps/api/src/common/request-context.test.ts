import { describe, expect, it, vi } from "vitest";
import {
  normalizeRequestId,
  redactLogValue,
  requestContextMiddleware,
} from "./request-context";

describe("request context", () => {
  it("preserves safe correlation IDs and replaces malformed values", () => {
    expect(normalizeRequestId("web:01J5ABCDEF")).toBe("web:01J5ABCDEF");
    expect(normalizeRequestId("bad id\nforged")).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("redacts credentials and personal fields in structured log serialization", () => {
    const serialized = JSON.stringify(
      {
        authorization: "Bearer abc",
        password: "secret",
        email: "person@example.test",
        requestId: "safe",
      },
      redactLogValue,
    );
    expect(serialized).not.toContain("Bearer abc");
    expect(serialized).not.toContain("person@example.test");
    expect(serialized).toContain('"requestId":"safe"');
  });

  it("returns the request ID and emits a bounded completion event", () => {
    const listeners = new Map<string, () => void>();
    const response = {
      locals: {},
      statusCode: 204,
      setHeader: vi.fn(),
      once: (name: string, listener: () => void) =>
        listeners.set(name, listener),
    };
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const next = vi.fn();
    requestContextMiddleware(
      {
        headers: { "x-request-id": "admin:request-1" },
        method: "POST",
        path: "/v1/cms/content",
      } as never,
      response as never,
      next,
    );
    listeners.get("finish")?.();
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Request-ID",
      "admin:request-1",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "traceparent",
      expect.stringMatching(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/u),
    );
    expect(next).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"requestId":"admin:request-1"'),
    );
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"traceId":'));
    write.mockRestore();
  });
});
