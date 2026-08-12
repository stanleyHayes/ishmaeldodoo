import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "./route";

const input = {
  requesterName: "Reporter",
  outlet: "Public Record",
  email: "reporter@example.test",
  locale: "en-GB",
  format: "pdf",
};

describe("press kit proxy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a native Lite form and returns the generated attachment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("%PDF-test", {
        status: 201,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": "attachment; filename=press-kit.pdf",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/press-kit", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(input),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("content-disposition")).toContain(
      "press-kit.pdf",
    );
    expect(await response.text()).toBe("%PDF-test");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/public/press-kit"),
      expect.objectContaining({ body: JSON.stringify(input) }),
    );
  });

  it("rejects malformed native form input before calling NestJS", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/press-kit", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...input, email: "not-an-email" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
