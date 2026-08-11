# ADR-003: Custom JWT authentication

- Status: Proposed security baseline; independent security approval required
- Date: 9 August 2026

## Context

The confirmed custom JWT choice must support accounts able to publish in the name of a public official or operate confidential workflows. A long-lived bearer JWT or browser storage design is unacceptable.

## Decision

NestJS is the sole issuer and verifier of privileged tokens. The admin application calls the API on an exact allow-listed origin with credentials enabled. Production admin and API origins should share one registrable parent domain. The public web application never receives admin tokens.

- Issue asymmetric, signed access JWTs with a maximum five-minute lifetime. Validate algorithm, issuer, audience, expiry, issued-at, unique ID, session ID, subject, role version and authentication strength.
- Keep access tokens in memory and deliver them only to same-origin application paths. Do not use local/session storage.
- Use a high-entropy opaque refresh token in a `Secure`, `HttpOnly`, `SameSite=Strict`, host-only API-origin cookie scoped to the refresh endpoint. Store only a peppered hash in MongoDB.
- Rotate on every refresh in a transaction. Reuse of an ancestor token revokes the whole family. Sessions support immediate individual/user-wide revocation and role-version invalidation.
- Protect cookie-authenticated mutations with strict origin checks and a bound CSRF token. Apply request size, rate, enumeration and credential-stuffing controls.
- Require MFA for all privileged roles. WebAuthn/passkeys are recommended; TOTP is a controlled fallback. Recovery codes are single-use hashes and recovery emits alerts and revokes other sessions.
- Password reset/invitation tokens are single-use, short-lived, hashed and purpose-bound. Login failures do not reveal account existence.
- Record security events with redacted metadata. Never log passwords, tokens, cookies, MFA secrets or recovery codes.

The implemented proposal uses eight 80-bit single-use recovery codes, stored only as purpose-separated hashes and atomically removed on use. Recovery revokes all older sessions. Recent TOTP step-up is represented only in a five-minute access token and is required for account-governance mutations and recovery-code rotation; refresh removes the elevation. This proposal does not approve provider notification, hardware-key policy, Principal break-glass or production recovery operations.

## Key management

Signing keys use `kid`, live outside the repository, rotate with an overlap window and have an emergency revocation procedure. Refresh pepper and signing keys have separate custody. Development secrets must never be accepted in production.

## Roles

Start with Principal, Desk Officer, Editor, Translator, Reviewer, Trust Administrator and Security Administrator. Authorisation is server-side and permission-based. High-impact actions require recent MFA and, where specified, a second human approver.

## Required review

An independent security lead must approve password hashing, MFA methods, cookie/domain topology, key custody, recovery, session limits and incident response before AMANOR-005 or authentication implementation can be `DONE`.

## Verification

Test algorithm confusion, forged/expired/wrong-audience tokens, rotation races, replay/family revocation, CSRF, origin bypass, session fixation, role changes, logout, recovery, brute force, timing leakage and log redaction.
