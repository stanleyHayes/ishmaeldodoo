# Provider secret custody and rotation record

- Status: `Not run`
- Environment, release and immutable source revision: `Not recorded`
- Render, Vercel and provider accounts/regions: `Not recorded`
- Exercise window, timezone, operators and independent observer: `Not scheduled`
- Named primary/secondary custodians and approval authorities: `Not assigned`
- Provider secret-manager resource and audit-export locations: `Not recorded`
- Break-glass owner, access method, expiry and revocation evidence: `Not recorded`
- Workload-identity availability and exception decisions: `Not assessed`
- Cross-environment resource/value isolation evidence: `Not run`
- Repository, build-log, image, artifact and frontend-bundle non-disclosure: `Not run`
- Admin/CMS receives no server secret: `Not run`

## Exact inventory reconciliation

| Secret class                  | Environment/consumer/provider resource | Secret version ID and dates | Least-privilege and dual-control evidence | Rotation/rollback/revocation evidence | Result       |
| ----------------------------- | -------------------------------------- | --------------------------- | ----------------------------------------- | ------------------------------------- | ------------ |
| `public_service_signing`      | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `revalidation_verification`   | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `analytics_provider`          | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `mongodb_application`         | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `mongodb_migration`           | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `mongodb_retention`           | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `mongodb_room`                | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `jwt_signing`                 | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `session_pepper`              | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `mfa_encryption`              | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `public_service_verification` | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `revalidation_signing`        | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `cloudinary`                  | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `cloudinary_retention`        | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `email_provider`              | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `calendar_provider`           | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `metrics_access`              | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `telemetry_export`            | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |
| `webauthn_relying_party`      | Not recorded                           | Not recorded                | Not recorded                              | Not run                               | Not assessed |

## Rotation acceptance

- JWT active/retiring key overlap and post-window removal: `Not run`
- Session-pepper overlap, legacy refresh and invitation drain: `Not run`
- MFA re-encryption aggregate report complete and safe to retire: `Not run`
- Service-HMAC and revalidation key-ring overlap: `Not run`
- MongoDB application/Room/job grant-denial proof after rotation: `Not run`
- Cloudinary runtime/retention credential separation and rotation: `Not run`
- Email, calendar and metrics dual-credential continuity: `Not run`
- Job credentials absent from long-running API and frontends: `Not run`
- Old versions disabled/revoked after validated drain: `Not run`
- Rollback restores service without resurrecting superseded access: `Not run`
- Alert, audit-log and incident-route evidence: `Not run`
- Temporary access removed and break-glass path resealed: `Not run`
- Defects, severity, owners, target dates and retest evidence: `None recorded`
- Security approval and date: `Not approved`
- Operations approval and date: `Not approved`
- Privacy approval and date: `Not approved`
- Product acceptance and date: `Not approved`

## Evidence rules

Complete one record per environment against the exact release above. Every
inventory row must reconcile to `infra/deployment/secret-inventory.json`; a
disabled optional class still needs an explicit disabled decision and owner.
Record provider resource identifiers and secret version identifiers only. Never
record secret values, private keys, tokens, credential-bearing URLs, recovery
codes, ciphertext, personal data or confidential Room material.

Exercise rotations through additive version creation, consumer rollout,
least-privilege verification, bounded overlap, rollback and superseded-version
revocation. A successful deploy alone is not a rotation. Missing dual control,
cross-environment reuse, incomplete MFA migration, retained old access,
unresolved high/critical defects or absent approval blocks release.
