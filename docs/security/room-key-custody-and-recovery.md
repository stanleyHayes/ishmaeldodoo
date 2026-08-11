# The Room: key custody, rotation and recovery

- Status: Proposed procedure. **Not yet rehearsed.** Principal and Security approval required before the channel opens (decision 2 in `docs/security/the-room-threat-model.md`).
- Scope: AMANOR-093 procedure; exercised by the drills named in AMANOR-096 and AMANOR-097.
- Related: `room-cryptography-adr.md`, `room-database-boundary.md`, `the-room-threat-model.md`.

There is no server-side decryption backdoor. Every procedure below is written on
the assumption that if both recipient private keys are lost, the ciphertext held
by the platform is unrecoverable by anyone, including the engineering team. That
is a deliberate property, not a defect, and it is why the two-recipient rule is a
precondition for opening the channel rather than a nicety.

## Roles

| Role                    | Holds                                                     | Never holds                                           |
| ----------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Principal               | Recipient private key 1, in hardware                      | The trust-anchor signing key                          |
| Designate (at most one) | Recipient private key 2, in hardware, while designated    | The trust-anchor signing key                          |
| Security Administrator  | Trust-anchor signing key custody and manifest publication | Any recipient private key                             |
| Engineering             | Nothing                                                   | Any private key, any ciphertext through general tools |

Separating the anchor signing key from the recipient keys means neither a
compromised recipient nor a compromised Security Administrator can both publish a
key and read what is encrypted to it.

## Key inventory

| Key                      | Type               | Custody                                          | Rotation                              |
| ------------------------ | ------------------ | ------------------------------------------------ | ------------------------------------- |
| Recipient key (×2)       | ECDH P-256         | Non-exportable hardware token, one per recipient | Annually, or immediately on suspicion |
| Trust anchor             | ECDSA P-256        | Offline hardware token, dual control             | Every two years, or on suspicion      |
| Pinned anchor public key | ECDSA P-256 public | Build-time constant in the public web bundle     | Only with a coordinated release       |

The pinned anchor public key ships in the bundle, so rotating the anchor requires
a public web deployment. That coupling is intentional: it makes silent anchor
replacement a visible, reviewable release rather than a data change.

## Issuing a recipient key

1. The recipient generates the key pair **on the hardware token**. The private
   key must never exist in a file, a password manager, an environment variable or
   the application database.
2. The recipient exports only the raw public point and transfers it to the
   Security Administrator over a channel that provides integrity.
3. Both parties independently verify the public key fingerprint out of band —
   by voice, not by the same channel that carried the key.
4. The Security Administrator adds it to the manifest body with the next epoch,
   marks the previous key `retiring`, and signs the manifest offline with the
   anchor token under dual control.
5. The signed manifest is published. The Principal receives an out-of-band notice
   that a manifest changed, regardless of who initiated it.
6. A metadata-only audit event records the action, actor, key ID and time.

## Rotation

Planned rotation follows the issuing procedure. Three rules govern it:

- The retiring key stays in the manifest until every ciphertext bound to it is
  actioned or deleted. The restricted inbox shows `recipientKeyId` and `keyEpoch`
  per item so this is verified, not assumed.
- Ciphertext is never re-encrypted. The platform cannot do it, and asking a
  recipient to decrypt and re-submit would create exactly the plaintext handling
  the design exists to prevent.
- A rotation is not complete until a test submission encrypted to the new key has
  been decrypted successfully in the restricted client.

## Emergency revocation

Trigger: a token is lost or stolen, a designate leaves, or compromise is suspected.

1. Security removes the key from the manifest, re-signs, and publishes. New
   submissions immediately use the remaining active key.
2. Admin sessions for the affected account are revoked immediately (AMANOR-117),
   and any Room designation is revoked (`room_designation_revoked`).
3. Ciphertext already encrypted to the revoked key is **not** deleted. It stays
   until its retention deadline or an authorised deletion, because deleting it
   would destroy evidence of what a compromised holder could have read.
4. The Principal is notified out of band. A metadata-only audit event is written.
5. If compromise is confirmed rather than suspected, the incident enters the
   severity-one runbook in `docs/handover/`, and the exposure window is stated in
   terms of key ID and epoch, never in terms of submission content.

## Loss of a recipient key

- **One key lost, one intact.** Revoke the lost key, issue a replacement, and
  continue. Ciphertext encrypted to the lost key is unreadable; the inbox shows
  how many items are affected by key ID so the loss can be reported honestly to
  the affected submitters using the reference-only notification path.
- **Both keys lost.** All outstanding ciphertext is permanently unreadable. The
  channel must be closed (`ROOM_ENABLED=false`) until new keys are issued and a
  new manifest is published. Submitters cannot be told what was in their
  submissions, because the platform never knew.

This is why the channel must not open to the public with a single recipient.

## Trust-anchor compromise

The most damaging failure: an attacker who can sign a manifest can publish their
own recipient key and receive decryptable submissions.

1. Take the Room offline immediately (`ROOM_ENABLED=false`); the public page must
   fail closed and offer the non-confidential contact route.
2. Generate a new anchor under dual control, re-sign a manifest containing only
   verified recipient keys, and ship the new pinned public key in a coordinated
   public web release.
3. Treat every submission received since the earliest possible compromise as
   potentially intercepted, and notify affected submitters by reference.
4. Commission an incident review; the pentest scope under AMANOR-097 must include
   the replacement anchor.

## Required drills before launch

None of these have been performed. Each is a launch gate.

| Drill                | Proves                                                                         | Owner                |
| -------------------- | ------------------------------------------------------------------------------ | -------------------- |
| Issue and verify     | A hardware-generated key reaches the manifest with out-of-band verification    | Security             |
| Round-trip           | A real submission decrypts in the restricted client on the intended device     | Principal            |
| Planned rotation     | Epoch increments, retiring key still decrypts, new submissions use the new key | Security             |
| Emergency revocation | Manifest, sessions and designation are revoked within the agreed window        | Security             |
| Single-key loss      | Affected item count is reported by key ID with no content exposure             | Principal/Security   |
| Anchor compromise    | Fail-closed, re-anchor and coordinated release complete end to end             | Security/Engineering |

## Open approvals

1. Security approves this procedure and the ADR suite.
2. Principal and Security approve hardware token models and dual-control custody.
3. Legal approves what a submitter is told when their submission becomes unreadable.
4. Independent cryptographic review, and the Room-scoped penetration test under AMANOR-097.
