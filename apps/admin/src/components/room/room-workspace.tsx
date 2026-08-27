"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminSelect } from "../ui/admin-select";
import {
  roomExtensionReasons,
  type RoomCiphertext,
  type RoomInboxItem,
  type RoomPlaintext,
} from "@amanor/contracts";
import { getAuthState } from "../../lib/api/auth-store";
import { ApiClientError } from "../../lib/api/client";
import {
  extendRoomRetention,
  fetchRoomCiphertext,
  listRoomInbox,
  setRoomEnquiryState,
} from "../../lib/room/client";
import {
  decryptWithRoomKey,
  installRoomAutoLock,
  lockRoomKey,
  onRoomKeyChange,
  roomKeyState,
  unlockRoomKey,
} from "../../lib/room/key-holder";

/**
 * The restricted decrypting client.
 *
 * It is a separate route rather than a tab in the CMS workspace, so decrypted
 * content never shares a bundle or a mounted tree with the editorial, media and
 * Desk surfaces. Whether it should go further and live on its own origin and
 * deployable is decision 3 in the threat model, still open.
 *
 * Plaintext exists in exactly one place — the `open` state below — and is
 * dropped when the operator closes the item, when the key locks, and when the
 * tab is hidden.
 */

function Metadata({ item }: Readonly<{ item: RoomInboxItem }>) {
  return (
    <dl className="room-item__meta">
      <div>
        <dt>Received</dt>
        <dd>{item.receivedAt.slice(0, 10)}</dd>
      </div>
      <div>
        <dt>Delete after</dt>
        <dd>{item.deleteAfter.slice(0, 10)}</dd>
      </div>
      <div>
        <dt>Key</dt>
        <dd>
          {item.recipientKeyId} (epoch {item.keyEpoch})
        </dd>
      </div>
      <div>
        <dt>Extensions</dt>
        <dd>{item.extensionCount}</dd>
      </div>
    </dl>
  );
}

export function RoomWorkspace() {
  const [items, setItems] = useState<readonly RoomInboxItem[] | null>(null);
  const [inboxState, setInboxState] = useState<
    "loading" | "ready" | "sealed" | "verification" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(roomKeyState().unlocked);
  const [open, setOpen] = useState<Readonly<{
    reference: string;
    plaintext: RoomPlaintext;
  }> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      onRoomKeyChange(() => {
        const state = roomKeyState();
        setUnlocked(state.unlocked);
        // Locking must take the plaintext with it.
        if (!state.unlocked) setOpen(null);
      }),
    [],
  );

  useEffect(() => installRoomAutoLock(), []);

  const refresh = useCallback(async () => {
    try {
      const page = await listRoomInbox();
      setItems(page.items);
      setInboxState("ready");
      setError(null);
    } catch (failure) {
      setItems([]);
      if (failure instanceof ApiClientError && failure.status === 404) {
        setInboxState("sealed");
        setError(null);
      } else if (failure instanceof ApiClientError && failure.status === 403) {
        setInboxState("verification");
        setError(null);
      } else {
        setInboxState("error");
        setError(
          "The encrypted inbox could not be reached. No message content was exposed.",
        );
      }
    }
  }, []);

  useEffect(() => {
    if (!getAuthState()) return;
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  if (!getAuthState()) {
    return (
      <main className="room-admin">
        <h1>The Room</h1>
        <p>
          Sign in to the administration console first, then return to this page.
        </p>
        <Link href="/">Go to the console</Link>
      </main>
    );
  }

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await unlockRoomKey({
        keyId: String(form.get("keyId") ?? ""),
        jwk: JSON.parse(String(form.get("jwk") ?? "")) as JsonWebKey,
      });
      setError(null);
    } catch {
      setError("That key could not be used. Nothing was stored.");
    }
  }

  async function reveal(reference: string) {
    setBusy(true);
    try {
      const released: RoomCiphertext = await fetchRoomCiphertext(reference);
      setOpen({
        reference,
        plaintext: await decryptWithRoomKey(released.envelope),
      });
      setError(null);
      await refresh();
    } catch (failure) {
      setOpen(null);
      setError(
        failure instanceof Error && /different key/iu.test(failure.message)
          ? "This submission was encrypted to a different key."
          : "That submission could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function act(
    reference: string,
    action: () => Promise<unknown>,
  ): Promise<void> {
    setBusy(true);
    try {
      await action();
      await refresh();
      setError(null);
    } catch {
      setError("That action could not be completed.");
    } finally {
      setBusy(false);
      void reference;
    }
  }

  return (
    <main className="room-admin" aria-labelledby="room-admin-title">
      <header>
        <p className="section-context">Restricted</p>
        <h1 id="room-admin-title">The Room</h1>
        <p>
          Submissions are decrypted in this browser only. Nothing decrypted here
          is sent back to the server, written to a log, or included in any
          export.
        </p>
      </header>

      {error && (
        <p role="alert" className="room-admin__error">
          {error}
        </p>
      )}

      <section aria-labelledby="room-key-title" className="room-admin__key">
        <h2 id="room-key-title">Recipient key</h2>
        {unlocked ? (
          <p>
            Unlocked as <strong>{roomKeyState().keyId}</strong>. It locks
            automatically after five minutes, and whenever this tab is hidden.{" "}
            <button type="button" onClick={lockRoomKey}>
              Lock now
            </button>
          </p>
        ) : (
          <form onSubmit={unlock}>
            <label htmlFor="room-key-id">Key identifier</label>
            <input id="room-key-id" name="keyId" required />
            <label htmlFor="room-key-jwk">Private key (JWK)</label>
            <textarea id="room-key-jwk" name="jwk" rows={4} required />
            <button type="submit">Unlock</button>
          </form>
        )}
      </section>

      <section aria-labelledby="room-inbox-title">
        <div className="room-admin__section-heading">
          <div>
            <p className="section-context">Ciphertext only</p>
            <h2 id="room-inbox-title">Restricted inbox</h2>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refresh()}
          >
            Check channel
          </button>
        </div>
        {inboxState === "loading" && (
          <div
            className="room-admin__skeleton"
            aria-label="Loading encrypted inbox"
            aria-busy="true"
          >
            <span />
            <span />
          </div>
        )}
        {inboxState === "sealed" && (
          <div className="room-admin__channel-state">
            <strong>The confidential channel is sealed.</strong>
            <p>
              Intake and operator routes are disabled until key custody and the
              restricted Room infrastructure are configured. No submissions can
              enter while the channel is sealed.
            </p>
          </div>
        )}
        {inboxState === "verification" && (
          <div className="room-admin__channel-state">
            <strong>Hardware-key verification is required.</strong>
            <p>
              Return to Security, verify an enrolled hardware key, then check
              this channel again within five minutes.
            </p>
            <Link href="/">Return to Security</Link>
          </div>
        )}
        {inboxState === "error" && (
          <div
            className="room-admin__channel-state room-admin__channel-state--error"
            role="alert"
          >
            <strong>Encrypted inbox connection interrupted.</strong>
            <p>
              Check the API connection and try again. The local recipient key
              remains locked to this browser.
            </p>
          </div>
        )}
        {inboxState === "ready" && items?.length === 0 && (
          <div className="room-admin__channel-state">
            <strong>No encrypted submissions are held.</strong>
            <p>The channel is available and the retention queue is clear.</p>
          </div>
        )}
        <ul className="room-admin__list">
          {items?.map((item) => (
            <li key={item.reference} className="room-item">
              <h3>{item.reference}</h3>
              <p className="room-item__state">{item.state}</p>
              <Metadata item={item} />
              <div className="room-item__actions">
                <button
                  type="button"
                  disabled={!unlocked || busy}
                  onClick={() => void reveal(item.reference)}
                >
                  Open
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(item.reference, () =>
                      setRoomEnquiryState(item.reference, "actioned"),
                    )
                  }
                >
                  Mark actioned
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(item.reference, () =>
                      setRoomEnquiryState(item.reference, "quarantined"),
                    )
                  }
                >
                  Quarantine
                </button>
                <AdminSelect
                  label="Extend retention"
                  value=""
                  disabled={busy}
                  onChange={(event) => {
                    const reason = event.target.value;
                    event.target.value = "";
                    if (!reason) return;
                    void act(item.reference, () =>
                      extendRoomRetention(item.reference, {
                        reason: reason as (typeof roomExtensionReasons)[number],
                        days: 90,
                      }),
                    );
                  }}
                >
                  <option value="">Select a reason…</option>
                  {roomExtensionReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason.replaceAll("_", " ")}
                    </option>
                  ))}
                </AdminSelect>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <section
          aria-labelledby="room-open-title"
          className="room-admin__reading"
        >
          <h2 id="room-open-title">{open.reference}</h2>
          <p className="room-admin__warning">
            Decrypted in this browser. Do not copy it into email, a ticket, or
            any other system.
          </p>
          <dl>
            <dt>From</dt>
            <dd>
              {open.plaintext.fromName} &lt;{open.plaintext.fromEmail}&gt;
            </dd>
            {open.plaintext.organisation && (
              <>
                <dt>Organisation</dt>
                <dd>{open.plaintext.organisation}</dd>
              </>
            )}
            <dt>Subject</dt>
            <dd>{open.plaintext.subject}</dd>
          </dl>
          <p className="room-admin__message">{open.plaintext.message}</p>
          <button type="button" onClick={() => setOpen(null)}>
            Close and clear
          </button>
        </section>
      )}
    </main>
  );
}
