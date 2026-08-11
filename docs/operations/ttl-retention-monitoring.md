# TTL retention monitoring

- Status: Engineering monitoring implemented; Legal approval and staging drill required
- Scope: General contact, media enquiries, Press Kit receipts and Living Dossier receipts
- Related: AMANOR-113, `docs/privacy/data-inventory-retention.md`

MongoDB TTL deletion is asynchronous. The API therefore scans only `expiresAt`
for four fixed collections every five minutes and exports aggregate due counts,
oldest-overdue age, scan health and last-success time through the protected
metrics endpoint. It never reads or exports names, addresses, messages,
organisations, references or generated documents.

## Alert response

`AmanorPersonalDataRetentionOverdue` pages when the oldest expired record remains
for more than two hours and five additional minutes. `AmanorPersonalDataRetentionScanFailure`
pages after five minutes of unhealthy scans.

1. Keep the affected intake/generation path available only if Privacy and the
   incident owner agree the accumulating volume is bounded; otherwise pause that
   one path without taking the public content site down.
2. Check MongoDB health, the TTL index on `expiresAt`, provider TTL-monitor state
   and the API identity's read-only monitoring access. Do not query or export
   requester fields during diagnosis.
3. Restore TTL processing. If provider TTL deletion cannot recover promptly, use
   a separately approved retention-job identity to delete only documents with
   `expiresAt <= now`; the runtime identity must not gain bulk-delete permission.
4. Observe the fixed-class due and oldest-age gauges return to zero and scan
   health return to one. Record only class-level counts, times and incident ID.
5. Reconcile the same expired set after any backup restore and complete the
   signed Privacy/Operations rehearsal record before production acceptance.

The repository recovery proof performs that reconciliation with a fixed
synthetic recovery cutoff across all four collections. It verifies that every
expired synthetic requester record is gone before access, each later-dated
control record remains, and every `expiresAt` TTL index survives restoration.
Run `npm run test:backup-restore`; production recovery must apply the actual
recorded cutover time rather than the fixture cutoff.

The two-hour threshold is an operational incident threshold, not a policy grace
period. Records remain due at `expiresAt`, and a non-zero due gauge still appears
on the dashboard before paging.
