# Release notes

## Unreleased - engineering baseline

This is not a production release. The repository currently provides independently buildable Next.js 16 public and Admin/CMS applications plus a NestJS API, shared runtime/OpenAPI contracts and MongoDB/Mongoose persistence. The ledger remains the authority for feature status and external gates.

### Implemented foundations

- Bilingual public shell, governed CMS publication workflow and dedicated Source, Atlas, Archive, Speaking, Press and Contact experiences.
- Custom JWT access/refresh sessions, mandatory invitation-time TOTP, revocation, account administration and redacted hash-linked authentication audit.
- Disabled-by-default WebAuthn security-key enrollment, revocation and assertion with five-minute `hwk` elevation; production activation still requires approved RP domains, authenticator policy and physical custody/recovery evidence.
- Cloudinary signed upload, verified registry, metadata/focal-point governance and protected retirement.
- Protocol Desk intake, triage, decision boundary, correspondence queue, Protocol Note, SLA escalation and provider-neutral availability.
- Privacy-gated analytics proxy, Sahel Mode, Night Economy Mode, discoverability surfaces and portable observability policy.
- Independent production container builds, OpenAPI/generated contracts, automated unit/integration/browser/coverage/security/performance gates.

### Known launch blockers

- D01-D10 stakeholder decisions, production identity/content/translations/media rights and external Legal/DPC/Security/accessibility approvals.
- Provider/domain accounts and production-like public/Admin/API deployments.
- Calendar adapter, live-provider MFA recovery notifications, approved WebAuthn authenticator/attestation/back-up policy and physical-key drills, final Room approvals, blocked optional features and approved production data.
- Independent SAST/image/DAST/infrastructure scans, penetration test, device/assistive-technology/load/restore drills, UAT and beta.
- DNS email authentication and institutional mailbox delivery tests.

### Upgrade and rollback notes

- Run forward-only MongoDB migrations with the dedicated migration identity before starting the new API runtime; never mutate an applied migration.
- Migration `20260811_032_webauthn_hardware_keys` creates the credential and single-use ceremony indexes. Keep `WEBAUTHN_ENABLED=false` unless the exact RP ID/name/Admin origin and every Security gate in the WebAuthn runbook are approved.
- Deploy API contract compatibility before clients that require new fields/roles. The current baseline adds `press_officer` and `press:manage`.
- Deploy the API before the Admin bundle that calls the six `/v1/auth/hardware-keys` operations. Disabling WebAuthn is a safe configuration rollback; credential deletion is not a rollback mechanism.
- Public web, Admin/CMS and API roll back independently. Do not roll back across a non-backward-compatible migration without an approved corrective forward migration.
- Verify `/v1/health/ready`, public content projection, Admin sign-in and one critical Protocol Desk path after promotion.

For a release candidate, replace `Unreleased` with version/date/source revision; enumerate migrations, environment/config changes, user-visible behavior, fixed security findings, known limitations, exact verification evidence and rollback decision deadline.
