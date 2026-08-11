# The Room: operations runbook

- Status: Engineering-complete for the implemented slice. **The channel must stay disabled (`ROOM_ENABLED=false`) until Security, Legal and the Principal sign the gates in `the-room-threat-model.md`.**
- Scope: AMANOR-095 and AMANOR-096 day-to-day operation.
- Related: `the-room-threat-model.md`, `room-cryptography-adr.md`, `room-key-custody-and-recovery.md`, `room-database-boundary.md`.

The single rule that governs everything below: **the platform cannot read a Room
submission, and no procedure in this runbook can make it read one.** If a
procedure appears to require plaintext on the server, it is wrong.

## What exists, and what is deliberately absent

| Surface           | Route                              | Notes                                              |
| ----------------- | ---------------------------------- | -------------------------------------------------- |
| Public page (EN)  | `/contact/room`                    | Copy is code, not CMS content — see below          |
| Public page (FR)  | `/fr/contact/room`                 | Reciprocal pair                                    |
| Key manifest      | `GET /v1/public/room/key-manifest` | Signed; browser verifies against the pinned anchor |
| Submission        | `POST /v1/public/room/enquiries`   | Ciphertext only; 3 per IP per hour                 |
| Restricted client | `/room` on the Admin deployment    | Separate route and bundle from the CMS workspace   |
| Operator API      | `GET/POST /v1/room/...`            | `room:access` plus every configured factor         |

Absent on purpose, and not defects:

- **No public status lookup.** A submitter's reference cannot be used to query
  anything. Enumeration has nothing to enumerate.
- **No search.** The operator inbox has no query field because there is no
  content index — there is nothing searchable but references and dates.
- **No attachments.** Envelope v1 is message-only; see the ADR. The public copy
  says so.
- **No email containing content.** Notifications carry a reference and nothing
  else, and submission receipt never depends on email succeeding.
- **No API route that publishes a key.** Publication uses a separate credential
  through `scripts/publish-room-manifest.mjs`.

The public page's copy is reviewed as code rather than edited through the CMS.
The procurement prohibition is a legal control under Section 12.2 of the brief,
and an editorial account must not be able to soften or remove it.

## Enabling the channel

Do not perform these steps until the launch gates are signed.

1. Issue recipient keys and publish a signed manifest — `room-key-custody-and-recovery.md`.
2. Provision the Room database user with exactly the grants in
   `room-database-boundary.md`. The application user must be denied on the Room
   database, and the Room user denied on the application database.
3. Set on the API: `ROOM_ENABLED=true`, `ROOM_MONGODB_URI`,
   `ROOM_TRUST_ANCHOR_KEY_ID`, `ROOM_TRUST_ANCHOR_PUBLIC_KEY`. Leave
   `ROOM_REQUIRED_AMR` unset so it defaults to `hwk`. Before this step, complete
   the approval and real-key drills in `webauthn-hardware-keys.md` and enable the
   exact Admin relying party; TOTP by itself does not satisfy Room access.
4. Set on the public web build: `NEXT_PUBLIC_ROOM_TRUST_ANCHOR_KEY_ID` and
   `NEXT_PUBLIC_ROOM_TRUST_ANCHOR_PUBLIC_KEY`, matching the API exactly. These
   are inlined at build time, so a change is a deployment.
5. Confirm `GET /v1/public/room/key-manifest` returns 200 and the public page
   renders a form. If the page shows "The confidential channel is closed", the
   browser could not verify the manifest — stop and fix that before announcing
   the channel.

With `ROOM_ENABLED=false` the module is never registered: the routes do not
exist at all rather than existing and refusing. That is what makes an
accidentally-enabled channel impossible.

## Daily operation

**Reading a submission.** Sign in to the Admin console, open `/room`, unlock with
the recipient key, then open an item. Decryption happens in the browser. The key
locks after five minutes of inactivity and whenever the tab is hidden; closing an
item clears the plaintext from memory.

Never copy decrypted content into email, a ticket, a chat message or any other
system. If an enquiry needs to become normal business, summarise it in
non-confidential terms and reference only the Room reference.

**Lifecycle.** `received` → `read` (set automatically on first open) →
`actioned`, or `quarantined` for a submission that misuses the channel. State
carries no content and is safe to discuss.

**Procurement misuse.** If a submission concerns 24-Hour Economy Authority
procurement, tender or contract matters despite the prohibition:

1. Mark it `quarantined`.
2. Do not act on its substance and do not forward it.
3. Reply, outside the platform, telling the sender the channel cannot consider
   it and pointing at the Authority's official process.
4. Tell the Principal that a quarantine occurred, by reference only.

**Extensions.** Retention is 180 days. An extension is explicit, capped at two
per submission and at 180 days each, and requires one of three categories:
`active_conversation`, `legal_hold`, `security_investigation`. Free text is not
accepted anywhere — the audit record holds the category, actor, reference, key ID
and time, and nothing else.

Legal hold is not implied by ordinary interest. Its authority and maximum
duration still require Legal approval (AMANOR-113).

**Designation.** Only the Principal may designate, only one designate may be
active, and nobody may designate themselves. Designation is an appended event in
the Room database, so it cannot be rewritten, and it expires on its own without
anyone remembering to revoke it. Revocation is another appended event.

## Deletion

The retention worker runs hourly. For each submission past its deadline it
removes the envelope, digest, size, locale and key binding, leaving a
content-free tombstone that carries the reference and the deletion time — enough
to reconcile a restored backup against what was deleted, and nothing more.

A TTL index would have been less code and was rejected: it deletes silently,
which would leave no evidence and would hide a failure.

If deletion fails, the item is marked and retried. The protected metrics endpoint
exports aggregate due, failed, oldest-overdue, scan-health and last-success values
without a reference, key ID or content label. Provisioned alerts page after a
failed deletion persists for two minutes, a scan remains unhealthy for five
minutes, or the oldest deletion exceeds 75 minutes overdue. A submission past its deadline is already invisible
to the operator inbox and to ciphertext release, so a stuck deletion does not
expose anything — but it must still be investigated.

Deleting the primary document does not by itself prove backup deletion. The local
authenticated recovery harness restores an intentionally stale synthetic Room
snapshot and reconciles it from separately preserved content-free deletion
evidence before access. Provider backup/evidence custody, key recovery and a
production-like timed rehearsal remain launch gates.

## Incidents

| Symptom                                      | Immediate action                                                                     | Then                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Public page shows "channel is closed"        | Check `key-manifest` returns 200 and the log for `absent` vs `unverifiable`          | Republish or re-anchor per the custody runbook                     |
| Log: `manifest unavailable: absent`          | No manifest is published for this environment                                        | Publish one; do not "fix" it by disabling verification             |
| Log: `manifest unavailable: unverifiable`    | **Treat as a possible key substitution.** Disable the channel                        | Anchor-compromise procedure in the custody runbook                 |
| Operator gets "Room access is not permitted" | Expected for anyone but the Principal or an active designate presenting every factor | Check `ROOM_REQUIRED_AMR` against what the platform issues         |
| "Encrypted to a different key"               | Ciphertext predates a rotation                                                       | Unlock with the retiring key; do not delete the item               |
| Submitters report 429                        | The 3-per-hour quota is working                                                      | Raise only with Security approval                                  |
| Retention failure count non-zero             | Check Room database write availability                                               | The worker retries hourly; acknowledge and resolve the page        |
| Oldest deletion exceeds 75 minutes           | Keep Room operator access closed and inspect aggregate scan/failure health           | Restore write service, drain, then prove all gauges return healthy |
| Retention scan health is zero                | Check Room database reachability and least-privilege grants without querying content | Restore the dependency and observe one successful bounded scan     |

Never paste a reference into a metrics label, a dashboard, an alert body or a
support ticket that leaves the organisation. Alerts name the failing component
and a generic condition, never a submission.

## What this runbook cannot tell you

Because the platform cannot read submissions, these questions have no
platform-side answer, and that is by design:

- What did a specific submission say? Only a recipient with the private key knows.
- Who sent it? The sender's identity is inside the ciphertext.
- Can you recover a submission after both recipient keys are lost? No.
- Can engineering read one to help debug? No. There is no support path that ends
  in plaintext, and any request for one should be refused and reported.

## Outstanding gates before this runbook is real

None of the following has been performed. Each is a launch blocker.

1. Security approval of the ADR suite and this operating model.
2. Legal approval of the bilingual notices, the lawful basis, the 180-day
   schedule, extension and legal-hold authority, and the subject-access process.
3. Principal and Security approval of hardware custody and designate onboarding.
4. Architecture decision on whether the restricted client moves to its own origin
   and deployable.
5. The six key drills in `room-key-custody-and-recovery.md`.
6. Timed deletion and restore-reconciliation rehearsal.
7. A browser review confirming no Room data reaches caches, history, logs,
   analytics, email or error reporting.
8. An independent Room-scoped penetration test (AMANOR-097) with every high and
   critical finding closed and retested.
