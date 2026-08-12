import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  signRoomKeyManifest,
  toBase64Url,
  type RoomKeyManifestBody,
  type RoomRecipientKey,
} from "@amanor/contracts";
import { loadRoomRecipientKey, submitRoomEnquiry } from "./client";

let anchor: CryptoKeyPair;
let anchorPublicKey: string;
let recipient: RoomRecipientKey;

const at = new Date("2026-08-10T00:00:00.000Z");

beforeAll(async () => {
  anchor = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  anchorPublicKey = toBase64Url(
    new Uint8Array(await crypto.subtle.exportKey("raw", anchor.publicKey)),
  );

  const pair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  recipient = {
    keyId: "rk-principal-2026",
    epoch: 3,
    algorithm: "ECDH-P256",
    purpose: "room-enquiry",
    publicKey: toBase64Url(
      new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
    ),
    notBefore: "2026-01-01T00:00:00.000Z",
    notAfter: "2027-01-01T00:00:00.000Z",
    status: "active",
  };

  process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_KEY_ID = "ta-room-2026";
  process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_PUBLIC_KEY = anchorPublicKey;
});

afterEach(() => {
  process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_KEY_ID = "ta-room-2026";
  process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_PUBLIC_KEY = anchorPublicKey;
});

async function manifestResponse(
  override: Partial<RoomKeyManifestBody> = {},
  signer: CryptoKey = anchor.privateKey,
) {
  const manifest = await signRoomKeyManifest({
    body: {
      manifestVersion: 1,
      issuedAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z",
      keys: [recipient],
      ...override,
    },
    trustAnchorKeyId: "ta-room-2026",
    trustAnchorPrivateKey: signer,
  });
  return new Response(JSON.stringify(manifest), { status: 200 });
}

const plaintext = {
  subject: "Lite facility structuring",
  message:
    "We would like a confidential conversation about a blended finance facility.",
  fromName: "A Counterparty",
  fromEmail: "counterparty@example.org",
};

describe("loadRoomRecipientKey", () => {
  it("returns the active key from a manifest signed by the pinned anchor", async () => {
    const fetcher = vi.fn().mockResolvedValue(await manifestResponse());
    await expect(
      loadRoomRecipientKey(fetcher as never, at),
    ).resolves.toMatchObject({ keyId: "rk-principal-2026", epoch: 3 });
  });

  it("fails closed when no anchor is pinned in the bundle", async () => {
    delete process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_PUBLIC_KEY;
    const fetcher = vi.fn();
    await expect(loadRoomRecipientKey(fetcher as never, at)).rejects.toThrow(
      /unavailable/iu,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed on a manifest signed by a different anchor", async () => {
    const hostile = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const fetcher = vi
      .fn()
      .mockResolvedValue(await manifestResponse({}, hostile.privateKey));
    await expect(loadRoomRecipientKey(fetcher as never, at)).rejects.toThrow(
      /unavailable/iu,
    );
  });

  it("fails closed when the manifest window has passed", async () => {
    const fetcher = vi.fn().mockResolvedValue(await manifestResponse());
    await expect(
      loadRoomRecipientKey(fetcher as never, new Date("2026-10-01T00:00:00Z")),
    ).rejects.toThrow(/unavailable/iu);
  });

  it("fails closed when the channel returns an error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 503 }));
    await expect(loadRoomRecipientKey(fetcher as never, at)).rejects.toThrow(
      /unavailable/iu,
    );
  });

  it("fails closed when only a retiring key is published", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      await manifestResponse({
        keys: [{ ...recipient, status: "retiring" }],
      }),
    );
    await expect(loadRoomRecipientKey(fetcher as never, at)).rejects.toThrow(
      /unavailable/iu,
    );
  });
});

describe("submitRoomEnquiry", () => {
  it("transmits ciphertext and never a plaintext field", async () => {
    let sent = "";
    const fetcher = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        sent = String(init.body);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              reference: "RM-2026-A2B3C4D5E6F7G2H3",
              status: "received",
              deleteAfter: "2027-02-06T00:00:00.000Z",
            }),
            { status: 202 },
          ),
        );
      });

    const receipt = await submitRoomEnquiry(
      { plaintext, recipient, locale: "en-GB" },
      fetcher as never,
    );

    expect(receipt.reference).toBe("RM-2026-A2B3C4D5E6F7G2H3");
    for (const secret of Object.values(plaintext)) {
      expect(sent).not.toContain(secret);
    }
    const body = JSON.parse(sent) as {
      envelope: { ciphertext: string };
      procurementAcknowledged: boolean;
    };
    expect(body.envelope.ciphertext.length).toBeGreaterThan(0);
    expect(body.procurementAcknowledged).toBe(true);
  });

  it("rejects an unrecognised receipt rather than claiming success", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reference: "GC-2026-0001" }), {
        status: 202,
      }),
    );
    await expect(
      submitRoomEnquiry(
        { plaintext, recipient, locale: "en-GB" },
        fetcher as never,
      ),
    ).rejects.toThrow(/unavailable/iu);
  });

  it("transmits nothing when the plaintext exceeds the permitted length", async () => {
    const fetcher = vi.fn();
    await expect(
      submitRoomEnquiry(
        {
          plaintext: { ...plaintext, message: "x".repeat(4_001) },
          recipient,
          locale: "en-GB",
        },
        fetcher as never,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
