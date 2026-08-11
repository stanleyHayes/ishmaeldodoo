import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encryptRoomEnvelope,
  toBase64Url,
  type RoomEnvelope,
  type RoomPlaintext,
  type RoomRecipientKey,
} from "@amanor/contracts";
import {
  ROOM_AUTO_LOCK_MILLISECONDS,
  decryptWithRoomKey,
  installRoomAutoLock,
  lockRoomKey,
  onRoomKeyChange,
  roomKeyState,
  unlockRoomKey,
} from "./key-holder";

const plaintext: RoomPlaintext = {
  subject: "Sahel facility structuring",
  message:
    "A sufficiently detailed confidential message for the restricted client.",
  fromName: "A Counterparty",
  fromEmail: "counterparty@example.org",
};

async function recipient(
  keyId: string,
): Promise<Readonly<{ key: RoomRecipientKey; jwk: JsonWebKey }>> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  return {
    jwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    key: {
      keyId,
      epoch: 1,
      algorithm: "ECDH-P256",
      purpose: "room-enquiry",
      publicKey: toBase64Url(
        new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
      ),
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
      status: "active",
    },
  };
}

let principal: Awaited<ReturnType<typeof recipient>>;
let envelope: RoomEnvelope;

beforeEach(async () => {
  lockRoomKey();
  principal = await recipient("rk-principal-2026");
  envelope = await encryptRoomEnvelope({
    plaintext,
    recipient: principal.key,
  });
});

afterEach(() => {
  lockRoomKey();
  vi.useRealTimers();
});

describe("Room key holder", () => {
  it("starts locked", () => {
    expect(roomKeyState()).toEqual({ unlocked: false, keyId: null });
  });

  it("decrypts only once unlocked", async () => {
    await expect(decryptWithRoomKey(envelope)).rejects.toThrow(/locked/iu);

    await unlockRoomKey({ jwk: principal.jwk, keyId: "rk-principal-2026" });
    await expect(decryptWithRoomKey(envelope)).resolves.toEqual(plaintext);
  });

  it("refuses anything that is not a P-256 private key", async () => {
    const publicOnly = { ...principal.jwk };
    delete publicOnly.d;
    await expect(
      unlockRoomKey({ jwk: publicOnly, keyId: "rk-principal-2026" }),
    ).rejects.toThrow(/private key is required/iu);
    expect(roomKeyState().unlocked).toBe(false);
  });

  it("never exposes the private key back out of WebCrypto", async () => {
    await unlockRoomKey({ jwk: principal.jwk, keyId: "rk-principal-2026" });
    const state = roomKeyState() as unknown as Record<string, unknown>;
    expect(Object.values(state)).not.toContain(principal.jwk.d);
    expect(JSON.stringify(state)).not.toContain(String(principal.jwk.d));
  });

  it("names the mismatch when ciphertext belongs to another key", async () => {
    const other = await recipient("rk-designate-2026");
    await unlockRoomKey({ jwk: other.jwk, keyId: "rk-designate-2026" });
    await expect(decryptWithRoomKey(envelope)).rejects.toThrow(
      /different key/iu,
    );
  });

  it("drops the key when locked, and notifies listeners", async () => {
    const listener = vi.fn();
    const stop = onRoomKeyChange(listener);
    await unlockRoomKey({ jwk: principal.jwk, keyId: "rk-principal-2026" });
    expect(listener).toHaveBeenCalledTimes(1);

    lockRoomKey();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(roomKeyState().unlocked).toBe(false);
    await expect(decryptWithRoomKey(envelope)).rejects.toThrow(/locked/iu);
    stop();
  });

  it("locks itself after the inactivity window", async () => {
    vi.useFakeTimers();
    await unlockRoomKey({ jwk: principal.jwk, keyId: "rk-principal-2026" });
    expect(roomKeyState().unlocked).toBe(true);

    vi.advanceTimersByTime(ROOM_AUTO_LOCK_MILLISECONDS - 1);
    expect(roomKeyState().unlocked).toBe(true);
    vi.advanceTimersByTime(1);
    expect(roomKeyState().unlocked).toBe(false);
  });

  it("restarts the window on each decryption", async () => {
    vi.useFakeTimers();
    await unlockRoomKey({ jwk: principal.jwk, keyId: "rk-principal-2026" });

    vi.advanceTimersByTime(ROOM_AUTO_LOCK_MILLISECONDS - 1_000);
    await decryptWithRoomKey(envelope);
    vi.advanceTimersByTime(ROOM_AUTO_LOCK_MILLISECONDS - 1_000);

    expect(roomKeyState().unlocked).toBe(true);
  });

  it("locks whenever the tab is hidden", async () => {
    const listeners = new Map<string, () => void>();
    const fakeDocument = {
      visibilityState: "visible",
      addEventListener: (name: string, handler: () => void) =>
        listeners.set(name, handler),
      removeEventListener: (name: string) => listeners.delete(name),
    };
    const uninstall = installRoomAutoLock(fakeDocument as unknown as Document);
    await unlockRoomKey({ jwk: principal.jwk, keyId: "rk-principal-2026" });

    fakeDocument.visibilityState = "hidden";
    listeners.get("visibilitychange")?.();
    expect(roomKeyState().unlocked).toBe(false);

    uninstall();
    expect(listeners.has("visibilitychange")).toBe(false);
  });
});
