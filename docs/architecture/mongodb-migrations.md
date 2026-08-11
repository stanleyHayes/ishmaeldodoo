# MongoDB migration operations

Project AMANOR uses append-only, forward-only MongoDB migrations under `src/platform/mongo/migrations/changes`.

## Rules

1. Migration IDs use sortable `YYYYMMDD_NNN_description` names.
2. Register migrations in ascending order in `registry.ts`.
3. Never edit an applied migration. The runner compares its checksum and stops if history changed.
4. Add a superseding migration to correct production state.
5. Every migration is idempotent at the database operation level and is tested on a fresh replica set and an upgraded fixture before release.
6. Destructive changes to active runtime data use expand/migrate/contract phases across separate releases. Rebuilding a non-authoritative shadow collection must first preserve every original record in a named recovery archive.
7. Application deployment must remain compatible with both the pre- and post-migration shape during rolling releases.

Migration `20260810_021_content_collection_indexes` replaces the foundation's obsolete root-level page/scholar indexes with indexes over the structured `data` envelope, then adds stable IDs and collection-specific natural/query keys for scholars, Office Hours cycles/answers, Selah, rider templates, email templates and pages.

Migration `20260810_022_core_content_indexes` performs the same envelope correction for Atlas, Archive, Speaking, Signals and Sources. It removes obsolete root `slug`/`ref` indexes and the unusable root location index, then creates stable IDs, unique `data.slug`/`data.ref` keys and the timeline/type/feature/chronology indexes used by bounded public projections.

Migration `20260810_023_identity_title_history` expands legacy canonical identity title records with a compatibility `longFormTitle` copied from the existing sourced title when the field is absent. Editors must review that transitional copy before the next publication; new writes require an explicitly supplied bilingual long-form title.

Migration `20260810_024_operational_content_indexes` adds stable identity, interval lookup, governed organisation/status-review and singleton configuration indexes for the private blackout, counterparty and Desk configuration collections used during Protocol Desk screening.

Migration `20260810_025_structured_publication_projections` archives every pre-projection shadow record in `structured_projection_legacy`, clears the non-authoritative named collections and rebuilds them from the exact `publications` and `content_versions` pairs. Runtime publication transactions then maintain schema-version-2 bilingual slots and deterministic English-first index data; the repository integrity verifier reports missing, mismatched and orphan slots.

Migration `20260810_026_protocol_retention` creates the bounded expiry/hold/stale-claim scan used by the separate Protocol Desk retention command. The job uses `MONGODB_RETENTION_URI`, not the runtime or migration identity; operating and restore-reconciliation steps are in `docs/operations/protocol-retention.md`.

## Release procedure

1. Back up the target and confirm point-in-time recovery.
2. Supply the one-shot release job with `MONGODB_MIGRATION_URI` for the migration identity and run the compiled API artifact's `npm run migrate --workspace @amanor/api`. Never expose this URI to the long-running API deployment.
3. Record the ID, checksum, description and timestamp in `migrations`.
4. Deploy the API with its restricted `MONGODB_URI` and `RUN_MIGRATIONS=false`. Production environment validation rejects `RUN_MIGRATIONS=true`.
5. Verify indexes, invariants and application health.
6. If a defect appears, roll the application back only when compatible, then issue a forward corrective migration. Never delete migration history.

Fresh-replica and upgrade-path runtime verification remains a release gate until a test MongoDB replica set is provisioned.

## Local replica-set verification

```bash
docker compose -f infra/docker-compose.test.yml up -d --wait
MONGODB_TEST_URI='mongodb://amanor_test_admin:amanor_test_admin_password@127.0.0.1:27028' npm run test:integration --workspace @amanor/api
docker compose -f infra/docker-compose.test.yml down --volumes
```

The test database uses unique disposable application and Room names and an authenticated replica set. It validates idempotent migrations, required indexes, session persistence, atomic refresh-token compare-and-swap plus consumption append, migration of legacy consumed hashes, TTL cleanup and family revocation when the oldest token is replayed after more than twelve rotations. It also creates a database-scoped Protocol Desk runtime identity with only `find` and `insert` on `protocol_request_events`, proves append/read succeeds, proves update/delete is rejected by MongoDB, and confirms the original event remains unchanged. Separate application and Room identities then prove allowed operations within their own databases, denial across both database boundaries and append-only Room security events.

## Production identity boundary

- A provisioning identity creates database users and roles; it is never available to an application container.
- A migration identity owns index and forward-migration privileges and is supplied only to a one-shot release job.
- A retention identity owns only the Protocol Desk request/note/correspondence mutations required by the approved schedule and is supplied only to the daily one-shot retention job.
- The API runtime identity receives explicit CRUD privileges for mutable application collections. For append-only collections such as `protocol_request_events`, it receives only `find` and `insert`.
- Never grant the runtime identity the built-in `readWrite` role for the whole application database: that would silently restore update/delete permission on audit collections.
- Never add the Room URI to migration, retention, reporting, backup-inspection or general application jobs. Provision its grants from the separately reviewed Room role manifest described in `docs/security/room-database-boundary.md`.
- Production deployment remains blocked until the provider-specific role manifest and one-shot migration job are rehearsed in staging.
