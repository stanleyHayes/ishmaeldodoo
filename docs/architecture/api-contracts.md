# Versioned API and error contract

- Status: Implemented v1 inventory; Architecture/Security review required
- Scope: AMANOR-009 and AMANOR-164
- Canonical machine specification: `packages/contracts/openapi/amanor-v1.json`
- Generated operation index: `packages/contracts/src/generated/api-operations.ts`

## Contract boundary

The independently deployed Next.js public and Admin/CMS applications call only the NestJS API. Every current route is rooted at `/v1`; a breaking request or response change requires a new major path rather than silent mutation. The checked-in OpenAPI document is generated from the assembled NestJS application, and CI rejects missing required operations or stale generated operation metadata.

The OpenAPI artifact is authoritative for implemented HTTP methods, paths, request schemas and success statuses. This document explains conventions and feature coverage; it does not replace the artifact.

## Implemented v1 families

| Family                       | Surface                                                                                                        | Authentication and purpose                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Health                       | `/v1/health/*`                                                                                                 | Deployment liveness/readiness; readiness never exposes credentials                                                              |
| Authentication               | `/v1/auth/*`                                                                                                   | Login, refresh rotation, logout, invitations, sessions, account governance, redacted audit and aggregate MFA migration evidence |
| CMS                          | `/v1/cms/content/*`                                                                                            | Bearer-authenticated, role-protected draft/version/review/publish/rollback/takedown and audit workflows                         |
| Public projections           | `/v1/public/content/*`, `/archive`, `/atlas`, `/speaking`, `/sources`, `/media/*`                              | Published allowlisted projections only; no draft, consent evidence or internal notes                                            |
| Public submissions/downloads | `/v1/public/protocol-desk/requests`, `/contact-enquiries`, `/media-enquiries`, `/press-kit`, `/living-dossier` | Runtime validation, bounded bodies and feature-specific rate limits; generated files never disclose provider secrets            |
| Protocol Desk                | `/v1/desk/requests/*`                                                                                          | Desk/Principal operations, availability, immutable notes/events, correspondence, clearance and Protocol Notes                   |
| The Room                     | `/v1/public/room/*`, `/v1/room/*`                                                                              | Feature-gated signed manifest/ciphertext intake and restricted metadata, local-decryption and designation operations            |
| Governed media               | `/v1/media/*`                                                                                                  | Role-protected Cloudinary signing, verification, metadata, inventory and retirement                                             |
| Internal delivery            | `/v1/internal/revalidation/claims/*`                                                                           | Signed service-to-service replay claim; not a browser API                                                                       |

## Error convention

Every non-success response uses JSON shaped as:

```json
{
  "statusCode": 400,
  "code": "BadRequestException",
  "message": "Request validation failed",
  "requestId": "correlation-id",
  "timestamp": "2026-08-10T00:00:00.000Z"
}
```

`statusCode` is the HTTP status repeated for clients. `code` is a bounded machine category, not provider text. `message` may explain a safe client error but must not echo submitted content, tokens, database errors or stack traces. `requestId` is returned as `X-Request-ID` and is the only value a requester needs to quote to support. Unexpected failures always collapse to `InternalServerError` and a generic message.

Validation rejects unknown fields, unsafe Mongo/prototype keys, excessive nesting and oversized bodies. Authentication failures must not reveal whether an email, invitation, request or other protected identifier exists. Rate-limited and dependency-failure responses follow the same envelope. File responses use their declared binary content type on success and the JSON envelope on failure.

## Compatibility policy

- Additive optional response fields and new routes may remain in v1; clients must ignore unknown response fields.
- Removing/renaming fields, changing meaning or optionality, narrowing enums, or changing a success status is breaking and requires `/v2` plus an overlap/deprecation plan.
- Request schemas reject undeclared fields; additions therefore require regenerated clients before callers send them.
- Cursor tokens and idempotency keys are opaque. Clients cannot infer database IDs or ordering from them.
- Public cacheability is declared by the endpoint; protected and generated responses are private/no-store.
- Dates are UTC ISO 8601 strings; locales are exactly `en-GB` and `fr-FR`; money carries currency and value year rather than an unqualified number.

## Feature-gated and absent contracts

The Room contract is canonical even when a deployment has `ROOM_ENABLED=false`. Disabled deployments register no Room controllers; the stable feature-gated contract allows the public and Admin clients to compile before key-custody prerequisites are satisfied. It includes only signed public-key metadata, ciphertext, receipts, lifecycle metadata and designation state—never plaintext fields or derivatives. Independent cryptographic/security approval, hardware-backed MFA, custody rehearsal and penetration testing remain launch gates and the contract must not be represented as operational approval.

Office Hours entry/draw/answer APIs await the approved programme decision and must encode 12-month entry deletion, auditable draw rules and consent before being added. Doctrine remains disabled pending D03 and needs a separately reviewed internal retrieval contract. Calendar synchronisation awaits the provider decision. Their absence from OpenAPI is intentional and must not be represented as delivered.

## Change procedure

1. Change shared runtime schemas and the NestJS controller/domain boundary together.
2. Add permission, validation, error and privacy-negative tests.
3. Generate `amanor-v1.json` from the assembled API and regenerate operation metadata.
4. Run the contract drift gate and all affected frontend tests.
5. For a breaking change, publish a versioned migration/deprecation note and retain the prior major version for the approved overlap window.
