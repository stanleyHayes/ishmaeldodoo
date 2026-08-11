import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "./route";

const valid = {
  locale: "en-GB",
  capacity: "personal",
  organisation: { name: "African Forum", type: "multilateral", country: "GH" },
  requester: { name: "Ama Mensah", role: "Director", email: "ama@example.org" },
  engagement: {
    type: "keynote",
    eventName: "Finance Forum",
    startsAt: "2026-12-01T09:00:00.000Z",
    city: "Accra",
    country: "GH",
    format: "in_person",
    language: "english",
    audienceSize: 200,
    audienceDescription: "Senior public and private finance leaders",
  },
  ask: {
    proposedTheme: "Financing transformation",
    objective: "Understand practical routes from ambition to investment.",
    recording: false,
  },
  logistics: {
    travel: "host_covered",
    honorarium: "discuss",
    invitationLetter: true,
    visaLetter: false,
    governmentProtocol: false,
    otherPrincipals: false,
    contactName: "Kojo Annan",
    contactPhone: "+233200000000",
  },
  consent: {
    dataProcessing: true,
    authorityToInvite: true,
    version: "2026-08",
  },
};

describe("Protocol Desk web boundary", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects malformed input before contacting NestJS", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/protocol-desk", {
        method: "POST",
        body: JSON.stringify({
          capacity: "official",
          logistics: { honorarium: "offered" },
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("forwards a valid request without caching and validates the receipt", async () => {
    const incomingTrace =
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const apiTrace = "00-4bf92f3577b34da6a3ce929d0e0e4736-7f3a9c18d561b277-01";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ reference: "PD-2026-0042", state: "received" }),
        {
          status: 202,
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": "protocol.request-42",
            traceparent: apiTrace,
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/protocol-desk", {
        method: "POST",
        headers: {
          "X-Request-ID": "protocol.request-42",
          traceparent: incomingTrace,
        },
        body: JSON.stringify(valid),
      }),
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-request-id")).toBe("protocol.request-42");
    expect(response.headers.get("traceparent")).toBe(apiTrace);
    expect(await response.json()).toEqual({
      reference: "PD-2026-0042",
      state: "received",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/v1/public/protocol-desk/requests",
    );
    const upstreamInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(upstreamInit.headers).get("x-request-id")).toBe(
      "protocol.request-42",
    );
    expect(new Headers(upstreamInit.headers).get("traceparent")).toBe(
      incomingTrace,
    );
  });
  it("fails closed on an invalid successful upstream response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ state: "received" }), { status: 202 }),
        ),
    );
    expect(
      (
        await POST(
          new Request("http://localhost/api/protocol-desk", {
            method: "POST",
            body: JSON.stringify(valid),
          }),
        )
      ).status,
    ).toBe(502);
  });
});
