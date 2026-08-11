import { beforeEach, describe, expect, it, vi } from "vitest";
import { signRevalidation } from "@/lib/revalidation/signature";

const { revalidateTag, claimRevalidation } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  claimRevalidation: vi.fn().mockResolvedValue("claimed"),
}));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/lib/revalidation/claim", () => ({ claimRevalidation }));
vi.mock("@/lib/env", () => ({
  webEnvironment: {
    REVALIDATION_WEBHOOK_KEYS: JSON.stringify({
      current: "a-revalidation-secret-that-is-long-enough",
      previous: "a-previous-revalidation-secret-long-enough",
    }),
    REVALIDATION_AUDIENCE: "amanor-public-web",
  },
}));

import { POST } from "./route";

const secret = "a-revalidation-secret-that-is-long-enough";

function signedRequest(
  body: string,
  timestamp = Date.now().toString(),
  keyId = "current",
  audience = "amanor-public-web",
  signingSecret = secret,
  signature = signRevalidation(keyId, audience, timestamp, body, signingSecret),
): Request {
  return new Request("https://www.example.test/api/revalidate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Amanor-Timestamp": timestamp,
      "X-Amanor-Key-Id": keyId,
      "X-Amanor-Audience": audience,
      "X-Amanor-Signature": signature,
    },
    body,
  });
}

describe("signed revalidation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimRevalidation.mockResolvedValue("claimed");
  });

  it("revalidates only signed, bounded tags", async () => {
    const body = JSON.stringify({
      idempotencyKey: "publish:page:home:en-GB:1",
      tags: ["content:page:home", "locale:en-GB"],
    });
    const response = await POST(signedRequest(body));
    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(revalidateTag).toHaveBeenCalledWith("content:page:home", "max");
  });

  it("rejects tampering, stale timestamps and replayed delivery", async () => {
    const unique = crypto.randomUUID();
    const body = JSON.stringify({ idempotencyKey: unique, tags: ["content"] });
    expect(
      (
        await POST(
          signedRequest(
            body,
            Date.now().toString(),
            "current",
            "amanor-public-web",
            secret,
            "invalid",
          ),
        )
      ).status,
    ).toBe(401);
    const stale = (Date.now() - 10 * 60 * 1_000).toString();
    expect((await POST(signedRequest(body, stale))).status).toBe(401);
    expect((await POST(signedRequest(body))).status).toBe(200);
    expect((await POST(signedRequest(body))).status).toBe(409);
  });

  it("accepts an overlap key and rejects unknown keys or audiences", async () => {
    const previousSecret = "a-previous-revalidation-secret-long-enough";
    const body = JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      tags: ["content"],
    });
    expect(
      (
        await POST(
          signedRequest(
            body,
            Date.now().toString(),
            "previous",
            "amanor-public-web",
            previousSecret,
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await POST(
          signedRequest(
            body,
            Date.now().toString(),
            "unknown",
            "amanor-public-web",
            previousSecret,
          ),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          signedRequest(
            body,
            Date.now().toString(),
            "current",
            "other-audience",
          ),
        )
      ).status,
    ).toBe(401);
  });

  it("fails closed when the shared replay claim is duplicate or unavailable", async () => {
    const body = JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      tags: ["content"],
    });
    claimRevalidation.mockResolvedValueOnce("replayed");
    expect((await POST(signedRequest(body))).status).toBe(409);
    claimRevalidation.mockResolvedValueOnce("unavailable");
    expect((await POST(signedRequest(body))).status).toBe(503);
    expect(revalidateTag).toHaveBeenCalledTimes(2);
  });

  it("does not consume the durable claim when cache invalidation fails", async () => {
    const body = JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      tags: ["content:page:home"],
    });
    revalidateTag.mockImplementationOnce(() => {
      throw new Error("cache backend unavailable");
    });

    expect((await POST(signedRequest(body))).status).toBe(503);
    expect(claimRevalidation).not.toHaveBeenCalled();
    expect((await POST(signedRequest(body))).status).toBe(200);
    expect(claimRevalidation).toHaveBeenCalledTimes(1);
  });
});
