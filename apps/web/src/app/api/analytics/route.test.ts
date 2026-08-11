import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { POST as consent } from "./consent/route";

const event = {
  name: "atlas_record_opened",
  route: "/record/atlas",
  locale: "en-GB",
  audience: "investor",
};
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://www.example.test/api/analytics", {
    method: "POST",
    headers: {
      origin: "https://www.example.test",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

describe("analytics route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANALYTICS_EVENT_ENDPOINT;
    delete process.env.ANALYTICS_SITE_ID;
  });

  it("silently declines tracking without explicit consent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request(event))).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and non-catalogued payloads", async () => {
    const crossOrigin = request(event, { origin: "https://attacker.example" });
    expect((await POST(crossOrigin)).status).toBe(403);
    expect(
      (
        await POST(
          request(
            { ...event, email: "person@example.test" },
            { cookie: "amanor-analytics=granted" },
          ),
        )
      ).status,
    ).toBe(400);
  });

  it("forwards only allowlisted dimensions and never blocks on provider failure", async () => {
    process.env.ANALYTICS_EVENT_ENDPOINT =
      "https://analytics.example.test/api/event";
    process.env.ANALYTICS_SITE_ID = "www.example.test";
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (await POST(request(event, { cookie: "amanor-analytics=granted" })))
        .status,
    ).toBe(204);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe("error");
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(payload).toEqual({
      domain: "www.example.test",
      name: "atlas_record_opened",
      url: "https://www.example.test/record/atlas",
      props: { locale: "en-GB", audience: "investor" },
    });
    expect(JSON.stringify(payload)).not.toContain("cookie");
  });

  it("returns after the deadline when the provider ignores abort", async () => {
    vi.useFakeTimers();
    process.env.ANALYTICS_EVENT_ENDPOINT =
      "https://analytics.example.test/api/event";
    process.env.ANALYTICS_SITE_ID = "www.example.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );

    const response = POST(
      request(event, { cookie: "amanor-analytics=granted" }),
    );
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(response).resolves.toMatchObject({ status: 204 });
    vi.useRealTimers();
  });

  it("sets an explicit six-month granted or denied choice on same-origin requests", async () => {
    const response = await consent(
      new Request("https://www.example.test/api/analytics/consent", {
        method: "POST",
        headers: {
          origin: "https://www.example.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ granted: false }),
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain(
      "amanor-analytics=denied",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=15552000");
  });
});
