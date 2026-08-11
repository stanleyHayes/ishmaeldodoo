# Security incident response runbook

- Status: Rehearsal required
- Severity-one notification target: Principal within 15 minutes (`Brief`)
- Post-incident review: within five working days (`Brief`)

## Declare and contain

1. The first responder opens a restricted incident record with time, reporter, affected deployable and generic category. Do not copy personal data, tokens, Room content or request bodies.
2. Page the named incident owner. Treat political/reputational exposure, confidential-data exposure, signing-key compromise, privileged-account takeover, defacement and false Principal communications as severity one.
3. Preserve logs and immutable audit evidence under the approved schedule. Do not make ad-hoc database exports.
4. Contain through the narrowest reversible action: revoke sessions/roles, rotate the affected key, disable an adapter, unpublish the exact locale, or isolate one deployable. Keep unaffected public information available where safe.

## Scenario actions

| Scenario                          | Immediate action                                                                                                                                                                                           | Recovery evidence                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Privileged credential compromise  | Disable account, revoke all session families, preserve auth audit, rotate exposed secrets, review role changes                                                                                             | Fresh MFA login, valid audit chain, no unknown active sessions                                                                |
| Lost or suspect WebAuthn key      | Keep the Room disabled if custody is uncertain; use fresh TOTP to revoke the exact credential; preserve `hardware_key_*` events; notify Security and the issuance custodian; do not lower required factors | Credential absent from active inventory, old assertion denied, replacement issued under two-person custody, audit chain valid |
| Defacement/mistaken publish       | Use audited locale takedown/rollback; inspect author/approver events; invalidate affected cache                                                                                                            | Correct public content, cache convergence and signed incident timeline                                                        |
| JWT/signing/revalidation key leak | Remove active key ID, deploy overlapping replacement, revoke sessions where applicable, reject old audience/key                                                                                            | Cross-deployment verification and old-key denial                                                                              |
| Personal-data exposure            | Stop affected route/export, preserve bounded evidence, notify privacy/Legal owner, assess subjects/processors/jurisdictions                                                                                | Approved notification decision, remediation and access/deletion checks                                                        |
| The Room exposure or key loss     | Disable Room intake/decryption, do not move ciphertext, notify Principal/Security, invoke approved custody/recovery process                                                                                | Independent cryptographic review and key/ciphertext reconciliation                                                            |
| Provider compromise/outage        | Disable or rotate adapter credential; keep durable jobs; use documented degraded path                                                                                                                      | Backlog drains once, no duplicate/lost action, provider scope reviewed                                                        |
| Malicious Doctrine output         | Disable model integration and serve curated fallback; preserve retrieval/audit evidence                                                                                                                    | Reviewed correction and authorisation before re-enable                                                                        |

## Communication

Only the Principal or named communications owner approves external statements. Use the pre-approved holding statement once supplied. Status updates contain impact, containment, next decision and time—never confidential content or speculation. Regulatory/data-subject notification timing and content are Legal decisions.

## Recovery and closure

- Validate the fix with adversarial reproduction and affected end-to-end journeys.
- Rotate temporary credentials and remove emergency access.
- Confirm monitoring, delivery queues, audit integrity, cache state and independent deployable health.
- Document root cause, detection gap, timeline, affected data/systems, decisions, corrective actions, owners and dates.
- Hold the review within five working days and add regression tests/runbook improvements.
- Closure requires the incident owner and relevant Product, Security, Privacy/Legal owner; severity one also requires Principal acknowledgement.

Staging must rehearse credential compromise, mistaken publish, provider outage and data exposure before launch. A physical WebAuthn-key loss/replacement drill requires the approved device and custody policy. The separate Room recipient-key loss scenario waits for cryptographic approval and remains a launch gate.
