# Project AMANOR handover package

- Status: Working package; not accepted
- Owner: Delivery lead
- Acceptance: AMANOR-151/152

This index is the controlled entry point for operating the independently deployed public web, Admin/CMS and NestJS API. It links current engineering guidance and records what must still be demonstrated before handover.

## Start here by role

| Audience                   | Required material                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Practical evidence                                                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Principal                  | CMS publishing, identity governance, Protocol Desk final decisions, Room security model, [Room operations](../security/room-operations.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Publish/rollback exercise, decision exercise, hardware-key training and the Room key-custody drills                                                                                                                          |
| Editor/Reviewer/Translator | [CMS operator guide](cms-operator-guide.md), [publication validation](../content/publication-validation.md), [source/claim audit](../operations/source-claim-audit.md), [takedown runbook](../operations/editorial-takedown.md)                                                                                                                                                                                                                                                                                                                                                                                                                            | Bilingual draft-review-publish, complete claim audit and timed rollback                                                                                                                                                      |
| Press Officer              | CMS media section in the operator guide, [media inventory](../operations/media-inventory.md), Cloudinary governance ADR                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Upload/verify/metadata/inventory/retire exercise without broader CMS access                                                                                                                                                  |
| Desk Officer               | [Protocol correspondence](../operations/protocol-correspondence.md), [availability](../operations/protocol-availability.md), [calendar synchronization](../operations/calendar-synchronization.md), [Protocol Note](../operations/protocol-note.md), [SLA response](../operations/protocol-desk-sla.md)                                                                                                                                                                                                                                                                                                                                                    | Complete request-to-close staging lifecycle and outage drill                                                                                                                                                                 |
| Trust Administrator        | CMS operator guide and privacy schedule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Consent-cleared scholar update and withdrawal scenario                                                                                                                                                                       |
| Security Administrator     | [WebAuthn hardware keys](../security/webauthn-hardware-keys.md), [Room cryptography ADR](../security/room-cryptography-adr.md), [Room key custody and recovery](../security/room-key-custody-and-recovery.md), [role matrix](../security/role-permission-matrix.md), [auth threat model](../architecture/authentication-threat-model.md), [privileged access audit](../architecture/privileged-access-audit.md), [automated scanning](../security/automated-scanning.md), [secret rotation](../security/secret-rotation.md), [incident response](security-incident-response.md), [data inventory](../privacy/data-inventory-retention.md)                  | Code-scanning triage, invite/revoke, audit integrity, WebAuthn enrollment/revocation, physical-key custody/recovery, key rotation and incident tabletop                                                                      |
| Engineer/on-call           | [architecture](../architecture/README.md), [release candidates](../operations/staging-release-candidate.md), [deployment secret inventory](../operations/deployment-secret-inventory.md), [email-domain authentication](../operations/email-domain-authentication.md), [100x load rehearsal](../operations/load-rehearsal.md), [device/network matrix](../quality/device-network-matrix.md), [observability](../operations/observability.md), [Protocol retention](../operations/protocol-retention.md), [media retention](../operations/media-retention.md), [disaster recovery](../operations/disaster-recovery.md), container guides, incident response | Deploy/rollback, credential injection/rotation, email-domain verification, load/Desk continuity, device/network evidence, retention reconciliation, provider deletion retry, alert drill, backup restore and outage recovery |

## Deployable ownership

| Deployable   | Purpose                                                       | Must remain independent                                               |
| ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web`   | Public Next.js 16 site and same-origin public proxies         | No MongoDB credentials, Mongoose, CMS drafts or backend secrets       |
| `apps/admin` | Protected Next.js 16 CMS/operations client                    | No authoritative workflow or persistence; deploy/revoke independently |
| `apps/api`   | NestJS domain, JWT auth, MongoDB/Mongoose, jobs and providers | Only service allowed backend credentials and provider secrets         |

## Controlled evidence set

- Architecture ADRs and boundary verifier.
- Current OpenAPI artifact and generated operation types.
- Requirements traceability, coverage baseline and the honestly scoped
  [manual assistive-technology matrix](../quality/manual-at-matrix.md).
- SPDX API SBOM and security scan reports.
- Environment-specific deployment manifests, secret custody records and rollback evidence when available.
- Approved privacy/DPIA, role matrix, threat models and penetration-test closure.
- The Room: [threat model](../security/the-room-threat-model.md), [cryptography ADR](../security/room-cryptography-adr.md), [key custody and recovery](../security/room-key-custody-and-recovery.md), [operations runbook](../security/room-operations.md) and [database boundary](../security/room-database-boundary.md). The channel ships disabled; every gate named in the operations runbook is outstanding.
- WebAuthn: [hardware-key operations](../security/webauthn-hardware-keys.md), approved environment RP records, authenticator/attestation/back-up policy, issuance inventory and signed physical-key loss/recovery drill. WebAuthn and the Room ship disabled until those external controls are accepted.
- UAT, beta, launch, training attendance, acceptance and hypercare records.
- Controlled [release acceptance](../operations/release-acceptance.md) templates from UAT through project closure.
- Controlled [disaster-recovery rehearsal record](../operations/templates/disaster-recovery-rehearsal-record.md) for provider PITR, Room reconciliation, key recovery and RTO/RPO acceptance.
- Controlled [retention and deletion rehearsal record](../operations/templates/retention-deletion-rehearsal-record.md) for TTL expiry, Protocol pseudonymisation, Room deletion, Cloudinary disposal, restored-backup reconciliation and independent approvals.
- Controlled [source and claim audit record](../operations/templates/source-claim-audit-record.md) for exact bilingual graph coverage, claim quality, rights/consent, defect closure and Content/Legal approval without sampling.
- Controlled [media inventory reconciliation record](../operations/templates/media-inventory-reconciliation-record.md) for exact registry/Cloudinary parity, bilingual accessibility metadata, rights/retention review, gap ownership, cleanup and Content/Legal approval.
- Controlled [institutional email delivery record](../operations/templates/institutional-email-delivery-record.md) for all nine templates across `.gov.gh`, `.un.org` and an EU institutional mailbox with delivery/read proof and four-party approval.
- Controlled [editorial takedown and recovery record](../operations/templates/editorial-takedown-rehearsal-record.md) for independently timed bad-content removal and immutable restoration across origin, edge, discoverability, outbox and audit evidence.
- Controlled [Protocol Desk lifecycle and Principal-phone record](../operations/templates/protocol-desk-lifecycle-phone-record.md) for provider-backed request-to-close execution and personal acceptance on the Principal's recorded physical device.
- Controlled [independent WCAG 2.2 AA audit record](../quality/templates/wcag-audit-remediation-record.md) for complete route/workflow scope, success-criterion findings, remediation, independent retest, exceptions and approvals.
- Controlled [independent security assessment record](../security/templates/independent-security-assessment-record.md) for authenticated DAST, hosting/IAM/infrastructure review, broad platform and Room-specific penetration scope, remediation, retest and approvals.
- Controlled [CodeQL triage record](../security/templates/codeql-triage-record.md) for exact hosted alert flows, safeguards, provider dispositions and dated Security approval without self-dismissing findings.
- Controlled [Ghana DPC registration and DPIA record](../privacy/templates/dpc-registration-dpia-record.md) for statutory controller registration, complete processing decisions, processor/transfers, notices, rights, retention, residual risk and approvals.
- Controlled [production content and identity acceptance record](../content/templates/production-content-acceptance-record.md) for immutable bilingual versions, canonical identity/title history, media/source/print/discoverability checks, freeze integrity and approvals.
- Controlled [production discoverability record](../operations/templates/production-discoverability-record.md) for external crawl/index, Search Console, sitemap/feed, canonical/hreflang, schema, social preview, cache and approval evidence.
- Controlled [edge WAF and abuse rehearsal record](../security/templates/edge-abuse-rehearsal-record.md) for active Cloudflare rules, trusted-proxy spoof resistance, bot/accessibility review, distributed/slow/outage drills, rollback and approvals.
- Controlled [deployed observability acceptance record](../operations/templates/deployed-observability-acceptance-record.md) for exact Web/Admin/API correlation, provider telemetry, uptime, collector-loss continuity, alert delivery/recovery, privacy review and named approvals.
- Controlled [provider secret custody and rotation record](../security/templates/provider-secret-custody-rotation-record.md) for all inventory classes, provider versions, environment isolation, dual control, least privilege, rotation/rollback/revocation and approvals without exposing values.
- Controlled [GitHub repository governance record](../operations/github-repository-governance.md) for active `main` history protection and the still-pending required-check/review transition without overstating post-push CI.
- Controlled [image supply-chain acceptance record](../security/templates/image-supply-chain-acceptance-record.md) for the three exact registry digests, signatures, provenance, SPDX/SARIF evidence, trusted identity, promotion rejection, rollback availability and approvals.
- Controlled [deployed analytics acceptance record](../operations/templates/deployed-analytics-acceptance-record.md) for the S04 decision, consent silence/withdrawal, exact eight-event ingestion, dashboard parity, suppression, privacy configuration, outage behavior, cleanup and approvals.
- Monthly, quarterly and six-month [measurement cadence](../operations/measurement-cadence.md) evidence.
- Versioned [release notes](release-notes.md) and completed [training evidence](training-evidence.md).

## Handover acceptance checklist

- [ ] Production release identifier and exact source revision recorded.
- [ ] Public/Admin/API domains, owners, environments and provider accounts recorded without secrets.
- [ ] Named primary/secondary on-call routes tested.
- [ ] All runbooks rehearsed against production-like staging with timestamps.
- [ ] Backup/PITR and key-recovery restore completed within approved objectives.
- [ ] Each privileged role completes its least-privilege training scenario.
- [ ] Principal completes the Protocol Desk flow on their own phone.
- [ ] Legal, privacy, security, accessibility and content approvals attached.
- [ ] Open high/critical defects are zero; accepted lower-risk items have owner/date.
- [ ] Final release notes, known limitations and rollback decision point approved.
- [ ] Handover demo completed and acceptance certificate signed.

No checkbox may be inferred from automated tests. The named owner must attach dated evidence. Secrets, confidential enquiries and personal-data exports must never be placed in this package.

While training is unexecuted, `npm run check:handover` binds its exact session
identity, eleven role-based scenario rows, competency acknowledgements and
Trainer/Product/Security/Privacy acceptance fields. One remaining `Not run` or
`Blocked` row cannot conceal a premature training or handover claim. Before the
first real session, extend the validator in the same reviewed change to require
the immutable release, timestamps, named participants/roles, durable per-row
evidence, tracked defects and separate dated approvals; do not delete the
pending-state guard without executed-state validation.
