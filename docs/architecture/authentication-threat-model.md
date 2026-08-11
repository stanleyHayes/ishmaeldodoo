# Authentication threat model

## Protected assets

Canonical identity, public publishing authority, Protocol Desk decisions, confidential enquiry routing, personal data, signing keys, refresh sessions and audit records.

## Trust boundaries

- Browser to Cloudflare/Next.js over TLS.
- NestJS authentication module to MongoDB using least-privilege credentials.
- Runtime to externally managed signing-key custody.
- Account recovery to verified out-of-band communication and Security Administrator oversight.

## Principal threats and controls

| Threat                  | Required controls                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password theft/stuffing | Long password policy, adaptive hash, uniform failure, per-account/IP throttles, mandatory MFA, alerts.                                                               |
| Access JWT theft        | Five-minute lifetime, in-memory use, fixed algorithm/issuer/audience/type, session and role versions, no browser storage.                                            |
| Refresh theft           | Secure HttpOnly SameSite=Strict host cookie, opaque 256-bit secret, server-side hash, rotation, complete TTL-backed consumption ledger and replay-family revocation. |
| CSRF                    | SameSite cookie, exact Origin validation, session-bound cookie/header proof, narrow refresh path.                                                                    |
| JWT confusion/forgery   | ES256 allow-list, `kid` validation, external key custody, mandatory claims and emergency rotation.                                                                   |
| Session fixation        | Server-generated session/family IDs; rotate on login, MFA elevation, password and role changes.                                                                      |
| Concurrent refresh race | Transactional compare-and-swap plus consumption append; revoke family on a lost race or replay, including tokens older than twelve rotations.                        |
| Privilege persistence   | Server-side permission checks, role version in JWT/session, immediate session revocation on role/disable change.                                                     |
| Recovery takeover       | Purpose-bound one-time tokens, mandatory second factor or supervised recovery, notification, all-session revocation.                                                 |
| Secret leakage          | No secret fields in event contracts/logs; environment/key manager only; automated secret scanning and redaction.                                                     |

## Implemented recovery and step-up baseline

- Enrollment and authenticated rotation each produce eight independent 80-bit recovery codes once. Only purpose-separated HMAC hashes are stored.
- Recovery codes are consumed with one atomic database update. Successful recovery revokes every prior session before creating a replacement session and appends a redacted security event.
- A recovery-authenticated session cannot perform account-governance mutations until a fresh TOTP challenge succeeds. Step-up is carried only in a five-minute in-memory access token and disappears on refresh.
- Invitations, role changes, disablement, re-enablement and recovery-code rotation require a recent step-up token. Routine Principal break-glass and support-assisted bypasses remain prohibited.
- Recovery and code rotation transactionally enqueue a bilingual, content-free notification. The bounded provider worker uses a stable idempotency key, durable failure/backoff and metadata-only alerting. Live provider/DNS delivery, hardware-backed MFA policy, a supervised recovery drill and independent Security approval remain launch gates.

## Required independent review

Before production, a security reviewer must approve key custody, password hash choice/cost, MFA and recovery procedures, rate limits, cookie topology, proxy trust, audit retention and incident response. Unit tests do not replace penetration testing or a recovery drill.
