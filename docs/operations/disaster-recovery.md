# Backup and disaster-recovery runbook

- Status: Local logical-restore foundation verified; provider approval/rehearsal required
- Scope: AMANOR-125
- Command: `npm run test:backup-restore`

## Recovery priorities

Keep the public static experience available where safe. Restore the API and authoritative MongoDB state before enabling Admin/CMS mutations, Protocol Desk decisions or queued provider delivery. The public web, Admin/CMS and API are independent deployables and must be evaluated separately.

## Local logical restore proof

The verifier starts the disposable authenticated MongoDB 8 replica set, seeds synthetic records plus unique, TTL and audit-integrity indexes, creates a compressed `mongodump` archive inside the container, restores it to a different database namespace, and verifies exact records and index semantics. The restored application namespace is kept unavailable while an explicit recovery cutoff removes expired general-contact, media-enquiry, Press Kit and Living Dossier records from the stale snapshot; a later-dated control record and every TTL index must survive. The verifier also captures an intentionally stale isolated Room snapshot containing synthetic ciphertext, deletes that enquiry in the live fixture, preserves the newer content-free Room event ledger independently, restores the stale snapshot, and reapplies the deletion evidence before verifying that all encrypted envelope and routing fields remain absent. It records backup/restore duration and always removes the container/network. No production or user data is read.

This proves that the current logical schema can be exported and restored, that the four implemented TTL-backed requester collections are purged to the recovery cutoff before access, and that a stale Room recovery point can be reconciled from a separately preserved content-free deletion ledger. It does not prove managed-provider point-in-time recovery, encryption-key recovery, backup-region isolation, production scale, approved RPO/RTO, provider custody of the independent Room ledger or production deletion reconciliation.

## Production incident procedure

1. Incident owner records detection time, last known good write and affected services without copying personal/confidential content.
2. Freeze Admin/CMS mutations and provider workers while keeping safe static public delivery available.
3. Infrastructure owner selects the provider recovery point within the approved RPO and records the snapshot/oplog evidence.
4. Restore into a new isolated database/cluster using provider-managed encrypted transport and custody-approved keys. Never overwrite the affected cluster first.
5. Apply only forward migrations required by the exact application release. An applied migration is never edited.
6. Verify collection counts, required indexes, audit-chain integrity, publication pointers, session revocation state, Desk event immutability, TTL policies and outbox idempotency.
7. Reconcile deletions/retention against the deletion ledger so restored data past its approved deadline is removed before user access.
8. Start the API with provider workers paused; verify readiness, protected authentication, published projections and redacted observability.
9. Enable Admin/CMS, then release each durable worker separately and prove jobs drain once without duplicate correspondence or revalidation.
10. Product/Security/Privacy approve cutover. Preserve the affected environment read-only for investigation under the approved schedule.

## Required rehearsal evidence

- Provider, region, backup frequency/retention, encryption key IDs and custody roles (never raw keys).
- Approved RPO/RTO and measured detection, selection, restore, validation and cutover timestamps.
- Snapshot/oplog recovery point and proof of independent restore target.
- Counts/index/audit/publication/session/Desk/outbox verification results.
- Retention and subject-erasure reconciliation after restore.
- Application and database rollback decision, owner and communication timeline.
- Evidence that the old environment is isolated and temporary credentials removed.
- Defects, remediation owners/dates and signed Product/Security/Privacy acceptance.

Record the exercise in the controlled
[disaster-recovery rehearsal record](templates/disaster-recovery-rehearsal-record.md).
Until a production-like provider environment exists, `npm run check:handover`
binds every pending recovery point, timestamp, RPO/RTO, retention/Room
reconciliation, key-custody, regional, teardown and Operations/Security/Privacy
approval field. Before the first real rehearsal, extend the validator in the
same reviewed change to require immutable provider identifiers, durable
evidence references, measured objective comparison, complete reconciliation
and dated approvals; do not delete the pending-state guard without an
executed-state replacement.

## Key-loss and regional failure

Key recovery must use the approved external custody/escrow process and a non-production recovery key; application environment files are not escrow. A regional exercise restores into the approved alternate region and verifies data-location/transfer obligations. The local proof covers only synthetic Room database restoration and deletion-ledger reconciliation. Production still requires an independently reviewed encrypted ciphertext backup scope, separate content-free deletion-ledger custody, least-privilege recovery identities, recipient-key recovery or approved crypto-erasure behavior, and a timed rehearsal.
