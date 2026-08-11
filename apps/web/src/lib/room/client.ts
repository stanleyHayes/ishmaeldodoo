import {
  encryptRoomEnvelope,
  roomReceiptSchema,
  selectRoomRecipientKey,
  verifyRoomKeyManifest,
  type RoomPlaintext,
  type RoomReceipt,
  type RoomRecipientKey,
} from "@amanor/contracts";
import type { SupportedLocale } from "../i18n/locale";

/**
 * Browser-side entry points for The Room. Everything here runs in the
 * submitter's own tab: the plaintext never crosses a network boundary, and the
 * page must not render an input until `loadRoomRecipientKey` has resolved.
 */

export class RoomUnavailableError extends Error {
  constructor() {
    super("The confidential channel is unavailable");
  }
}

/**
 * The pinned trust anchor. Inlined at build time, so replacing it requires a
 * public web deployment rather than a data change — which is exactly what makes
 * a silent key substitution a visible release.
 */
export function pinnedTrustAnchor(): Readonly<{
  keyId: string;
  publicKey: string;
}> | null {
  const keyId = process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_KEY_ID;
  const publicKey = process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_PUBLIC_KEY;
  if (!keyId || !publicKey) return null;
  return { keyId, publicKey };
}

/**
 * Fails closed on every path: no anchor pinned, no manifest, an unverifiable
 * signature, an expired window, or no usable key. The caller must treat a
 * failure as "the channel is closed", never as "submit in the clear".
 */
export async function loadRoomRecipientKey(
  fetcher: typeof fetch = fetch,
  at: Date = new Date(),
): Promise<RoomRecipientKey> {
  const anchor = pinnedTrustAnchor();
  if (!anchor) throw new RoomUnavailableError();

  let manifest: unknown;
  try {
    const response = await fetcher("/api/room/key-manifest", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new RoomUnavailableError();
    manifest = await response.json();
  } catch {
    throw new RoomUnavailableError();
  }

  try {
    const body = await verifyRoomKeyManifest({
      manifest,
      trustAnchorKeyId: anchor.keyId,
      trustAnchorPublicKey: anchor.publicKey,
      at,
    });
    return selectRoomRecipientKey(body, at);
  } catch {
    // Uniform: the submitter is told the channel is unavailable, not which
    // check failed, because the distinction is only useful to an attacker.
    throw new RoomUnavailableError();
  }
}

export async function submitRoomEnquiry(
  input: Readonly<{
    plaintext: RoomPlaintext;
    recipient: RoomRecipientKey;
    locale: SupportedLocale;
  }>,
  fetcher: typeof fetch = fetch,
): Promise<RoomReceipt> {
  // If encryption throws, nothing is transmitted and no draft is persisted.
  const envelope = await encryptRoomEnvelope({
    plaintext: input.plaintext,
    recipient: input.recipient,
  });

  const response = await fetcher("/api/room/enquiries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      envelope,
      locale: input.locale,
      confidentialityAcknowledged: true,
      procurementAcknowledged: true,
    }),
  });

  const body: unknown = await response.json().catch(() => null);
  const receipt = roomReceiptSchema.safeParse(body);
  if (!response.ok || !receipt.success) throw new RoomUnavailableError();
  return receipt.data;
}
