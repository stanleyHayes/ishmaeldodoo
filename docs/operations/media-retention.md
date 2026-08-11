# Governed media retention operations

- Status: Engineering enforcement implemented; Legal/provider approval and staging drill required
- Scope: AMANOR-007, AMANOR-111, AMANOR-113, AMANOR-125, AMANOR-140 and AMANOR-177
- Command: `npm run retain --workspace @amanor/api`

The isolated daily retention job enforces governed Cloudinary asset deadlines in
addition to Protocol Desk pseudonymisation. It selects only `expires` assets at
or before `retainUntil`, never `permanent` assets or legal holds. An exact asset
reference in any currently published version defers disposal for 24 hours and
keeps the registry record active for operator resolution.

An eligible unreferenced asset is atomically quarantined before the provider
call, so public projections stop returning it. The job then requests Cloudinary
destruction with CDN invalidation and marks the registry tombstone `deleted`,
removing its delivery URL. Provider failure leaves the asset quarantined,
records only a bounded error, and schedules a one-hour retry. An abandoned lock
is reclaimable after one hour. Each invocation handles at most 100 assets and a
non-zero failure count makes the command fail for scheduler alerting.

## Credential boundary

The retention job receives a dedicated MongoDB identity plus a separate,
delete-capable Cloudinary key:

```text
MONGODB_RETENTION_URI
CLOUDINARY_RETENTION_CLOUD_NAME
CLOUDINARY_RETENTION_API_KEY
CLOUDINARY_RETENTION_API_SECRET
```

Do not inject these values into Web, Admin/CMS, the migration job, or evidence.
The long-running API keeps its independent Cloudinary upload/governance key.
The retention MongoDB identity requires bounded read/update access to
`media_assets`, `publications` and `content_versions`, plus its existing
Protocol Desk grants; it must not publish content or mutate publication rows.

## Daily and recovery evidence

1. Verify `media_retention_scan` exists and the job is non-concurrent.
2. Record only deleted, referenced and failed aggregate counts plus the release
   digest and execution time. Never copy asset metadata or credential values.
3. Investigate referenced expiries in the protected inventory. Renew an
   approved licence/consent deadline or unpublish the exact reference before
   the next disposal attempt; never bypass the reference check.
4. On failure, keep the registry asset quarantined while verifying the
   least-privilege provider key, Cloudinary status and retry result.
5. After backup restore, keep traffic disabled, run migrations, run retention
   until no deletion or failure remains, verify all expired unheld assets are
   either deleted or explicitly publication-blocked, then obtain
   Privacy/Operations cutover approval.

Production acceptance still requires Legal approval of media schedules and
hold authority, a real Cloudinary deletion/invalidation rehearsal, provider
audit evidence, restored-backup reconciliation and signed operator review.
