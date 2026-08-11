import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "./route";

const input = {
  token: "a".repeat(43),
  action: "hold",
  reason: "Awaiting final diary confirmation",
} as const;

describe("Principal decision web boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects malformed capabilities before contacting NestJS", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/protocol-desk/principal-decisions", {
        method: "POST",
        body: JSON.stringify({ ...input, token: "short" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the token only in a no-store POST body and validates success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ reference: "PD-2026-0042", state: "held" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/protocol-desk/principal-decisions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(input.token);
    expect(url).toBe(
      "http://localhost:4000/v1/public/protocol-desk/requests/principal-decisions",
    );
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual(input);
  });

  it("fails closed when a successful upstream response violates the contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ state: "held" }), { status: 200 }),
        ),
    );
    const response = await POST(
      new Request("http://localhost/api/protocol-desk/principal-decisions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
    expect(response.status).toBe(502);
  });
});
