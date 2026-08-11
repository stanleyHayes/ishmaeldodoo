import { describe, expect, it } from "vitest";
import { createTraceContext } from "./trace-context";

describe("W3C trace context", () => {
  it("continues a valid trace with a new server span", () => {
    const incoming = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const context = createTraceContext(incoming);
    expect(context.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(context.parentSpanId).toBe("00f067aa0ba902b7");
    expect(context.spanId).toMatch(/^[0-9a-f]{16}$/u);
    expect(context.traceparent).toBe(
      `00-${context.traceId}-${context.spanId}-01`,
    );
  });

  it.each([
    undefined,
    "invalid",
    "00-00000000000000000000000000000000-0000000000000000-01",
  ])("starts a new sampled trace for invalid input %s", (incoming) => {
    const context = createTraceContext(incoming);
    expect(context.traceId).toMatch(/^[0-9a-f]{32}$/u);
    expect(context.parentSpanId).toBeUndefined();
    expect(context.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/u);
  });
});
