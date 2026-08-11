import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "./route";

const input = {
  requesterName: "Requester",
  organisation: "Partner",
  email: "person@example.test",
  purpose: "Internal institutional briefing",
  variant: "institutional",
  locale: "en-GB",
};

describe("living dossier proxy", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects malformed input before reaching the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/living-dossier", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("streams a private PDF and preserves its trace reference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("%PDF-test", {
          status: 201,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": "attachment; filename=test.pdf",
            "x-dossier-reference": "ref-1",
          },
        }),
      ),
    );
    const response = await POST(
      new Request("http://localhost/api/living-dossier", {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-dossier-reference")).toBe("ref-1");
    expect(await response.text()).toBe("%PDF-test");
  });
  it("accepts a native Sahel form post and forwards the typed JSON contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("%PDF-test", {
        status: 201,
        headers: { "content-type": "application/pdf" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/living-dossier", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(input),
      }),
    );
    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/public/living-dossier"),
      expect.objectContaining({ body: JSON.stringify(input) }),
    );
  });
});
