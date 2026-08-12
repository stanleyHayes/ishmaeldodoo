# Deployment secret inventory and custody

- Status: Provider-neutral inventory complete; production custody evidence not yet recorded
- Machine-readable source: `infra/deployment/secret-inventory.json`
- Deployment contract: `infra/deployment/environment-contract.json`
- Verification: `npm run check:environment`

The public Web, Admin/CMS and NestJS API are separate security principals. Secrets are created independently for preview, staging and production in the selected provider secret manager. Values never enter source control, frontend build arguments, release records, logs, screenshots, tickets or handover evidence.

## Injection boundaries

- Web receives its public API service HMAC, revalidation verification ring and optional analytics configuration only at server runtime. `NEXT_PUBLIC_ROOM_*` trust-anchor values are deliberately public integrity metadata, not secrets.
- Admin/CMS receives no secrets. Its public `NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV` and `NEXT_PUBLIC_API_BASE_URL` settings are compiled into the browser artifact and share one fail-closed parser with CSP generation. Authentication material is issued at runtime by NestJS and is never a deployment variable.
- The long-running API receives its least-privilege application and optional Room database identities plus authentication, revalidation, media, email and metrics credentials at runtime. Its optional OTLP endpoint and sampling ratio are non-secret provider configuration; collector authentication belongs at the private network/workload-identity boundary and must not be embedded in the endpoint. WebAuthn enablement, RP ID/name and exact Admin origin are also non-secret relying-party configuration; they never contain authenticator secrets or credential material.
- `MONGODB_MIGRATION_URI` is injected only into the one-shot migration job. `MONGODB_RETENTION_URI` and the dedicated `CLOUDINARY_RETENTION_*` deletion credential are injected only into the scheduled retention job. None belongs in either frontend; the job credentials do not belong in the long-running API deployment.

An environment may share a source revision, but never a credential value or provider resource with another environment. The Room database identity remains distinct from the application identity and has no cross-database grants.

## Provisioning evidence

For every inventory class, the platform owner records only the provider resource identifier, environment, consumer, secret version identifier, creator/approver, creation and next-rotation dates, least-privilege check, and linked rotation or rollback exercise. Evidence must say `Not provisioned` until the provider state exists and must never contain a secret value or credential-bearing URL.

Production promotion requires two-person review of provider access, workload identities where available, version pinning, audit logging, emergency-access ownership and revocation of superseded versions. Rotation follows `docs/security/secret-rotation.md`; MongoDB job identities additionally follow the migration and retention runbooks.

Reconcile every exact inventory class and attach the provider-bound custody,
least-privilege, rotation, rollback, revocation and approval evidence in the
[provider secret custody and rotation record](../security/templates/provider-secret-custody-rotation-record.md).
An unfilled row or pending approval keeps AMANOR-120 and production promotion
open; provider configuration must never be inferred from repository checks.

## Drift response

Adding a provider credential requires one inventory class or an explicit variable under an existing class, an `.env.example` placeholder, environment validation in the consuming application, a documented rotation method and an updated deployment contract when the class is new. `check:environment` fails on unowned classes, missing examples, ambiguous variable ownership, secret-bearing `NEXT_PUBLIC_*` names, Admin secrets or migration/retention credentials assigned to API runtime. The gate exercises five adversarial mutations on every run so these denial paths cannot silently weaken while the valid inventory remains green.
