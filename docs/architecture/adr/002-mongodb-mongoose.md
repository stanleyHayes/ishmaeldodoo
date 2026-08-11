# ADR-002: MongoDB and Mongoose

- Status: Accepted technical baseline; hosting and retention approval pending
- Date: 9 August 2026

## Decision

Use MongoDB as the operational store and Mongoose for explicit persistence schemas. Modules own collections and repository interfaces. Cross-document authoritative transitions use replica-set transactions. Indexes are declared intentionally and production schema synchronisation is disabled; migrations create or change indexes and backfill data through idempotent forward-only steps.

Persisted documents include schema version, timestamps and relevant tenant/security boundaries. Mongoose validation is not trusted as the public input boundary: route/application commands are parsed first with Zod. Optimistic concurrency is enabled for edited content. Soft deletion is used only where retention/legal policy requires it; otherwise explicit deletion jobs and audit tombstones apply.

## Security and operations

- Separate database users for application, migrations, read-only reporting and The Room.
- TLS in transit and provider-managed encryption at rest; field-level encryption for selected sensitive values.
- Point-in-time recovery, tested restores, region decision and retention schedules are launch gates.
- Logs contain stable internal identifiers, not content bodies, tokens or confidential enquiry data.
- Refresh secrets are salted/peppered hashes. Passwords use a reviewed adaptive password hash; bcrypt is scaffolding only until the security ADR is approved.

## Vector retrieval

If F05 is authorised, use MongoDB vector search only after a volume/quality spike proves retrieval and regional availability. Embeddings are derived solely from approved, corrected archive passages and carry source/version references. No separate vector store is introduced without an ADR.

## Verification

Run migrations against a fresh replica set and an upgraded fixture, exercise transaction rollback, index uniqueness, concurrency, backup/restore and least-privilege denial tests.
