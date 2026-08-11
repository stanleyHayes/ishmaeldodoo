import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthState, setAuthState } from "../api/auth-store";
import {
  extendRoomRetention,
  fetchRoomCiphertext,
  getRoomDesignation,
  grantRoomDesignation,
  listRoomInbox,
  revokeRoomDesignation,
  setRoomEnquiryState,
} from "./client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const inboxItem = {
  reference: "RM-2026-A2B3C4D5E6F7G2H3",
  state: "received",
  locale: "en-GB",
  recipientKeyId: "rk-principal-2026",
  keyEpoch: 1,
  receivedAt: "2026-08-10T12:00:00.000Z",
  deleteAfter: "2027-02-06T12:00:00.000Z",
  extensionCount: 0,
  ciphertextBytes: 362,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.test/v1";
  setAuthState({ accessToken: "access-1", csrfToken: "csrf-1" });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearAuthState();
  vi.unstubAllGlobals();
});

describe("Room admin client", () => {
  it("refuses to call the Room at all without a session", async () => {
    clearAuthState();
    await expect(listRoomInbox()).rejects.toThrow(
      /Authentication is required/iu,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the bearer token and never caches a Room response", async () => {
    fetchMock.mockResolvedValue(json({ items: [inboxItem], total: 1 }));
    await listRoomInbox();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/v1/room/enquiries");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer access-1",
    );
  });

  it("rejects an inbox payload that does not match the contract", async () => {
    fetchMock.mockResolvedValue(
      json({ items: [{ reference: "nope" }], total: 1 }),
    );
    await expect(listRoomInbox()).rejects.toThrow();
  });

  it("returns ciphertext untouched for local decryption", async () => {
    const envelope = {
      envelopeVersion: 1,
      suite: "ECDH-P256-HKDF-SHA256-AES256GCM",
      envelopeId: "0123456789abcdef0123456789abcdef",
      recipientKeyId: "rk-principal-2026",
      keyEpoch: 1,
      ephemeralPublicKey: "A".repeat(87),
      nonce: "B".repeat(16),
      ciphertext: "C".repeat(200),
    };
    fetchMock.mockResolvedValue(
      json({
        reference: inboxItem.reference,
        envelope,
        receivedAt: inboxItem.receivedAt,
        deleteAfter: inboxItem.deleteAfter,
      }),
    );

    const released = await fetchRoomCiphertext(inboxItem.reference);
    expect(released.envelope).toEqual(envelope);
  });

  it("attaches the CSRF proof to every mutation", async () => {
    fetchMock.mockResolvedValue(json({ status: "ok" }));
    await setRoomEnquiryState(inboxItem.reference, "actioned");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("csrf-1");
    expect(JSON.parse(String(init.body))).toEqual({ state: "actioned" });
  });

  it("sends only a reason category and a bounded day count when extending", async () => {
    fetchMock.mockResolvedValue(
      json({
        reference: inboxItem.reference,
        status: "received",
        deleteAfter: "2027-05-07T12:00:00.000Z",
      }),
    );

    const deleteAfter = await extendRoomRetention(inboxItem.reference, {
      reason: "legal_hold",
      days: 90,
    });

    expect(deleteAfter).toBe("2027-05-07T12:00:00.000Z");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      reason: "legal_hold",
      days: 90,
    });
  });

  it("percent-encodes a reference rather than interpolating it into a path", async () => {
    fetchMock.mockResolvedValue(json({ status: "ok" }));
    await setRoomEnquiryState("RM-2026/../admin", "actioned").catch(
      () => undefined,
    );
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("RM-2026%2F..%2Fadmin");
  });

  it.each([
    [403, "Room access is not permitted"],
    [404, "Room access is not permitted"],
  ])("gives status %i a uniform denial message", async (status, message) => {
    fetchMock.mockResolvedValue(json({ message: "anything" }, status));
    await expect(listRoomInbox()).rejects.toThrow(message);
  });

  it("retries once after refreshing an expired access token", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(json({ accessToken: "access-2" }))
      .mockResolvedValueOnce(json({ items: [], total: 0 }));

    await expect(listRoomInbox()).resolves.toEqual({ items: [], total: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [refreshUrl] = fetchMock.mock.calls[1] as [string];
    expect(refreshUrl).toBe("https://api.test/v1/auth/refresh");
  });

  it("clears the session rather than looping when the refresh fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(json({ message: "no" }, 401));

    await expect(listRoomInbox()).rejects.toThrow(
      /Authentication is required/iu,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads and mutates designation through the contract", async () => {
    const state = {
      designate: {
        userId: "designate-1",
        grantedAt: "2026-08-10T12:00:00.000Z",
        expiresAt: "2026-09-10T12:00:00.000Z",
        active: true,
      },
    };
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(() => Promise.resolve(json(state)));
    await expect(getRoomDesignation()).resolves.toEqual(state);
    await expect(
      grantRoomDesignation({
        userId: "designate-1",
        expiresAt: "2026-09-10T12:00:00.000Z",
      }),
    ).resolves.toEqual(state);

    fetchMock.mockImplementation(() =>
      Promise.resolve(json({ designate: null })),
    );
    await expect(revokeRoomDesignation()).resolves.toEqual({ designate: null });
    const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(init.method).toBe("DELETE");
  });
});
