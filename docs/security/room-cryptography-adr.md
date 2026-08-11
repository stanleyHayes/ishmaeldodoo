# ADR: The Room cryptographic suite (envelope v1)

- Status: Proposed. Implemented behind `ROOM_ENABLED=false`; **requires Security approval before any production key is issued.**
- Scope: AMANOR-093. Satisfies decision 1 of "Required decisions before implementation" in `docs/security/the-room-threat-model.md`.
- Owner: Engineering (proposal); Security (approval); Principal and Security jointly (key custody, see `room-key-custody-and-recovery.md`).
- Source: Project AMANOR Website Build Brief, F13 (page 26) and Sections 10.2, 12.1-12.6.

## Context

F13 requires that submissions are encrypted in the browser to a public key before
transmission, that the server stores ciphertext only and cannot read the contents,
and that decryption happens in a restricted admin client. The threat model requires
the design to hold even when the API, the operational database account, logs,
analytics, the email provider or an ordinary Admin/CMS account is compromised.

Two constraints shaped the choice as much as the security target:

1. The site must work on mid-range Android and Samsung Internet under Sahel Mode
   (F11, AMANOR-138). A suite that needs a large third-party crypto bundle
   conflicts with the sub-200 KiB route budget and with "dedicated minimal
   bundles, no third-party scripts" in the threat model.
2. Ingress already enforces a 32 KiB JSON body limit before controllers
   (AMANOR-118). The envelope must fit inside it.

## Decision

**Suite v1 identifier: `ECDH-P256-HKDF-SHA256-AES256GCM`.**

| Element            | Choice                                 | Reason                                                                                                                                   |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Key agreement      | Ephemeral-static ECDH on NIST P-256    | Present in every WebCrypto implementation since 2014, including Samsung Internet and mid-range Android. No library ships to the browser. |
| Key derivation     | HKDF-SHA-256                           | Binds the derived key to both public points and to purpose, suite, recipient key ID and epoch.                                           |
| Content encryption | AES-256-GCM, 96-bit nonce, 128-bit tag | Authenticated encryption; hardware-accelerated on target devices.                                                                        |
| Manifest signature | ECDSA P-256 with SHA-256               | Same curve and the same WebCrypto availability argument; verified in the browser against a pinned anchor.                                |
| Encoding           | base64url without padding              | URL- and JSON-safe; fixed lengths are asserted by the contract schema.                                                                   |

X25519 and XChaCha20-Poly1305 were rejected **only** on availability grounds:
WebCrypto X25519 is absent from the older Android WebView and Samsung Internet
builds that the brief's device matrix names. This is recorded so that a future
envelope v2 can revisit it once that floor rises.

### Envelope v1

Defined and schema-enforced in `packages/contracts/src/room.ts`.

- `envelopeVersion`, `suite` — rejected at ingress if unknown, without any decryption attempt.
- `envelopeId` — 128 bits of CSPRNG output, never derived from content.
- `recipientKeyId`, `keyEpoch` — pin the exact key the browser used.
- `ephemeralPublicKey` — fresh per submission (65 raw bytes).
- `nonce` — fresh per submission (12 bytes).
- `ciphertext` — AES-GCM output including the tag, bounded to 12 000 base64url characters.

Associated data is `roomEnvelopeAssociatedData()`: purpose, envelope version,
suite, recipient key ID and epoch, joined by newlines. It is deliberately
**reference-independent** — it never includes `envelopeId` or the public receipt
— so stored ciphertext cannot be linked to public state by an observer who
learns a reference. Altering `keyEpoch` or `recipientKeyId` in transit therefore
breaks decryption rather than silently succeeding; there is a direct test for
this.

The derived key never leaves the browser as exportable material: `deriveKey` is
called with `extractable = false` and a single usage.

### Key manifest

`roomKeyManifestSchema`, served over the public web and verified in the browser
**before** the submitter can enter any sensitive text:

- at most two live recipients — the Principal and one designate — enforced by schema;
- a fixed validity window on the manifest and on every key;
- `status: active | retiring`. A retiring key still decrypts existing ciphertext
  but is never offered for a new submission, so rotation is not a cliff edge;
- an ECDSA signature over a canonical, order-fixed payload
  (`canonicalRoomKeyManifestPayload`), so key order and JSON formatting cannot
  change the signed bytes;
- a trust-anchor key ID that must equal the anchor pinned in the public bundle.

Verification fails closed on a malformed manifest, an unpinned anchor identity,
a bad signature, or an expired window. There is no unverified fallback path.

### Scoped out of v1

**Attachments.** The threat model treats attachments as an asset, but envelope v1
carries an encrypted message only. Two reasons: the 32 KiB pre-controller body
limit from AMANOR-118, and the requirement that the server performs no parsing
and no multipart handling on Room routes. Attachment support requires envelope
v2, a separate bounded ciphertext-object path with its own quota, and a fresh
Security review. Until then the public copy must not promise attachments.

**Padding and traffic analysis.** Ciphertext length reveals an approximate
message length. Bucketed padding is deferred to v2 and named as a residual risk
below, because it interacts with the ingress size limit.

## Rotation and epoch handling

- A new recipient key is published as `active` with `epoch = previous + 1`; the
  previous key moves to `retiring` in the same signed manifest.
- New submissions always select the highest-epoch active key
  (`selectRoomRecipientKey`).
- A retiring key is removed from the manifest only after every ciphertext bound
  to it has been actioned or deleted; the inbox exposes `recipientKeyId` and
  `keyEpoch` per item so this is checkable rather than assumed.
- There is no re-encryption service. The server cannot re-encrypt because it
  cannot decrypt, which is the point.

## Consequences

- The API can validate structure, bounds, versions and duplicates without ever
  holding a key. Ingress rejects on shape alone.
- A full database compromise yields ciphertext, a locale, two acknowledgement
  booleans, timestamps and an unpredictable reference. No subject, name, address
  or organisation.
- Losing a recipient private key destroys access to ciphertext encrypted to it.
  This is intended and is why `room-key-custody-and-recovery.md` requires two
  independent recipients before the channel opens to the public.
- The restricted client must hold the private key. Its custody model, not this
  ADR, is the weakest link, and it is reviewed separately.

## Residual risks carried to Security review

1. Ciphertext length leaks approximate message length (padding deferred to v2).
2. P-256 and ECDSA are not misuse-resistant primitives; the implementation
   mitigates this by never reusing a nonce, deriving a fresh key per submission,
   and constraining all inputs by schema before use.
3. A compromised public web bundle could serve a hostile trust anchor. Mitigated
   by strict CSP, dependency pinning and no third-party scripts on Room routes;
   not eliminated. Independent penetration testing under AMANOR-097 is required.
4. The manifest is currently signed offline with an anchor whose custody is
   defined but not yet exercised. The drill in the custody runbook is a launch gate.

## Verification evidence

`packages/contracts/src/room-crypto.test.ts` and `room.test.ts` (39 tests):
round-trip under the correct private key; rejection of a different recipient's
key, tampered ciphertext, and an altered `keyEpoch`; absence of every plaintext
field from the transmitted envelope; freshness of ephemeral key, nonce and
identifier across submissions; manifest rejection on key substitution, unpinned
anchor, wrong anchor identity, expired window and malformed input; and recipient
selection that skips retiring and out-of-window keys.

Approval of this ADR by Security, and an independent cryptographic review,
remain outstanding.
