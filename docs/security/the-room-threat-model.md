# The Room threat model

- Status: Engineering review; Legal and independent Security approval required
- Owner: Security lead (approval); Principal (key access and designation); Engineering (implementation)
- Scope: AMANOR-079 and AMANOR-092-097
- Source: Project AMANOR Website Build Brief, F13 and Sections 10.2, 12.1-12.6

## Security objective

The Room is a distinct confidential channel for institutional and investment conversations. It is not a general contact form, Protocol Desk workflow, procurement channel, tender channel or contract-negotiation system. The design must preserve confidentiality even if the API, operational database account, logs, analytics, email provider or ordinary Admin/CMS account is compromised.

The browser encrypts submission content to an approved public key before transmission. The API accepts and stores ciphertext plus purpose-limited routing metadata only. Plaintext decryption occurs only in a restricted admin client controlled by the Principal or one designated person using hardware-backed MFA.

## Non-goals

- Anonymous dead-drop protection against a fully compromised submitter device.
- Procurement, tender, contract or 24-Hour Economy Authority case management.
- Search, analytics, automated classification, content moderation or email delivery of enquiry content.
- Server-side plaintext recovery, support-assisted decryption or access by engineers.
- Hiding network metadata from the submitter's network provider or the platform edge.

## Assets and sensitivity

| Asset                             | Classification                | Required property                                                                                               |
| --------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Enquiry plaintext and attachments | Restricted confidential       | Never available to API, MongoDB operators, logs, analytics, email or general Admin/CMS roles                    |
| Recipient private keys            | Critical secret               | Non-exportable hardware custody where supported; never stored in application databases or environment variables |
| Recipient public-key registry     | Security critical public data | Authenticated, versioned, pinned by key ID and resistant to silent replacement                                  |
| Ciphertext envelope               | Restricted                    | Integrity protected, size bounded, versioned and unlinkable to public content                                   |
| Minimal routing metadata          | Confidential personal data    | Minimise, encrypt at rest where applicable, retain for no longer than approved purpose                          |
| Reference and lifecycle state     | Internal                      | Unpredictable reference, no content-derived values, immutable security events without plaintext                 |
| Access and deletion evidence      | Restricted audit              | Actor, action, reference, key ID and time only; no content or identifying plaintext                             |

## Actors and permissions

| Actor                                                                | Allowed                                                                                                         | Explicitly denied                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Submitter                                                            | Read the bilingual warning, verify recipient key identity, encrypt locally, submit ciphertext, retain a receipt | Query other submissions, submit procurement data through structured fields, recover plaintext from the service |
| Principal                                                            | Decrypt and manage authorised submissions after hardware-key MFA and step-up                                    | Export private keys into the application or receive plaintext by email                                         |
| One designated recipient                                             | Same bounded Room permissions while designation is active                                                       | Delegate again, access after revocation, use ordinary Desk Officer privileges as a substitute                  |
| Desk Officer, Editor, Translator, Press Officer, Trust Administrator | None                                                                                                            | Discover existence, metadata or content through their normal APIs                                              |
| Security Administrator                                               | Manage account policy and investigate metadata-only security evidence                                           | Decrypt content or designate themselves                                                                        |
| Engineer/operator                                                    | Deploy and inspect redacted health telemetry                                                                    | Read ciphertext through general tools, query personal metadata, decrypt or impersonate a recipient             |

At most two human recipients may be active: the Principal and one explicit designate. Recipient designation, revocation and public-key changes require step-up authentication, an out-of-band notification to the Principal and an immutable metadata-only audit event.

## Trust boundaries and data flow

```text
Submitter browser
  -> fetch authenticated public-key manifest from public web
  -> validate key ID, algorithm, purpose and validity window
  -> encrypt plaintext and attachments locally
  -> send versioned ciphertext envelope plus minimal metadata over TLS 1.3
Public web / edge
  -> enforce body, origin, bot and rate controls without recording body content
NestJS Room ingress
  -> validate envelope structure and cryptographic bounds without decrypting
  -> persist through Room-only repository credentials
Room collections
  -> hold ciphertext, minimal routing state, key ID and deletion deadline
Restricted Admin client
  -> require Room permission, hardware-key MFA and fresh step-up
  -> fetch ciphertext and decrypt locally with recipient-held private key
  -> render plaintext only in a non-cacheable isolated view
Notification adapter
  -> send reference and generic action notice only
Deletion worker
  -> remove ciphertext/metadata at deadline unless an authorised extension exists
  -> retain content-free deletion evidence under the approved audit schedule
```

The Room may share a MongoDB deployment with other bounded contexts, but not credentials, collections, repository code paths, queues or backup access policy. General API and reporting credentials must receive database-level denial for Room collections. The Room credential must receive denial for CMS, Protocol Desk and authentication content it does not need.

## Required ciphertext envelope

The concrete cryptographic suite remains an implementation ADR decision under AMANOR-093 and requires independent review. The envelope contract must nevertheless bind:

- schema and cryptographic suite versions;
- recipient key ID and key-validity epoch;
- a fresh random content-encryption key and nonce per submission;
- authenticated ciphertext for every field and attachment;
- reference-independent associated data covering purpose and envelope version;
- plaintext length limits enforced before encryption and ciphertext limits enforced at ingress;
- no plaintext filenames, MIME descriptions, subjects, organisation names or email addresses outside encrypted fields.

The API must reject unknown versions, retired keys outside an approved grace path, duplicate envelope identifiers, invalid encodings, oversized values and malformed authentication tags without attempting decryption. Error messages must be uniform and contain no submitted values.

## Threats and mandatory controls

| Threat                                          | Abuse path                                                            | Mandatory controls                                                                                                                                                | Verification gate                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Server or database compromise                   | Attacker queries stored submissions                                   | Browser-side authenticated encryption; ciphertext-only schema; private keys absent from server; Room-only DB user                                                 | Schema review, database permission-denial integration test, ciphertext inspection |
| Malicious or compromised public-key replacement | Attacker publishes their own key and receives decryptable submissions | Signed/versioned manifest, two-person or Principal approval, key pinning metadata, transparency audit, out-of-band change notice                                  | Key-substitution adversarial test and custody review                              |
| Compromised ordinary Admin/CMS account          | User calls Room APIs                                                  | Separate Room permission, hardware-key MFA, fresh step-up, deny-by-default route and repository controls                                                          | Cross-role HTTP and browser denial tests                                          |
| Compromised designate                           | Designate retains access indefinitely                                 | Single-designate cap, explicit expiry/revocation, key rotation/re-encryption policy, immediate session revocation                                                 | Revocation and recovery drill                                                     |
| Engineer or observability leakage               | Body appears in logs, traces, exceptions or analytics                 | Body-blind middleware; route-specific logging suppression; metadata allowlist; error redaction; no session replay on Room routes                                  | Sink canary tests across logs, telemetry, analytics and error reporting           |
| Email/provider leakage                          | Plaintext copied into a notification                                  | Fixed generic template containing reference only; no requester identity, subject, content or attachment                                                           | Exact payload test and provider sandbox inspection                                |
| Browser XSS or compromised dependency           | Script reads plaintext before encryption or after decryption          | Dedicated minimal bundles, strict CSP, no third-party scripts/analytics, dependency pinning, Trusted Types where viable, isolated origin considered in AMANOR-093 | CSP/browser adversarial review and independent pentest                            |
| Ciphertext tampering or replay                  | Envelope altered or resubmitted                                       | AEAD integrity, unique envelope ID, idempotency record, immutable received timestamp and generic rejection                                                        | Tamper/replay tests                                                               |
| Enumeration and traffic analysis                | Attacker discovers references or activity                             | Cryptographically random non-sequential public receipts, uniform responses, rate limits, no public status lookup, padded/bucketed payload decision in AMANOR-093  | Enumeration and response-comparison tests                                         |
| Oversized or malicious attachment               | Resource exhaustion or parser exploit                                 | Encrypt in browser, strict pre/post-encryption limits, stream/body caps, no server parsing, content-independent storage quota                                     | Boundary and load tests                                                           |
| Procurement misuse                              | Submitter uses Room for tender/contract discussions                   | Prominent bilingual prohibition, no procurement fields, acknowledgement of scope, operational quarantine/escalation procedure after authorised decryption         | Copy/legal approval and workflow test                                             |
| Accidental screen/cache leakage                 | Decrypted content persists locally                                    | `private, no-store`, no service-worker cache, clipboard/download warnings, automatic lock, memory cleanup best effort, no screenshots in support tooling          | Browser cache/history inspection and operator review                              |
| Backup/replica persistence after deletion       | Expired data survives indefinitely                                    | 180-day default expiry, explicit bounded extension, provider-aware backup expiry/crypto-erasure design, restore-time deletion reconciliation                      | Timed deletion and restore rehearsal                                              |
| Denial of service                               | Attack consumes storage or prevents legitimate access                 | Dedicated quotas/rate namespace, bounded ciphertext, bot control with privacy review, storage alerts that never contain content                                   | 100x load and exhaustion tests                                                    |
| Coercion or lost hardware key                   | Recipient cannot decrypt or attacker gains device                     | Approved dual-control recovery, revocation and rotation runbook; no server-side backdoor                                                                          | Key-loss recovery drill and independent cryptographic review                      |

## Retention, access and erasure

- Default deletion deadline is exactly 180 days from receipt.
- An extension is explicit, reasoned, time-bounded, performed only by an authorised Room recipient after step-up and written to a content-free audit event.
- Legal hold is not implied by ordinary interest. Its authority, maximum duration and review cadence require Legal approval before implementation.
- Scheduled deletion removes ciphertext, encrypted metadata, attachment objects and search/routing derivatives. There must be no plaintext derivative.
- Subject access or erasure requests have a named owner and 30-day service level. Identity matching must not create a plaintext index; the operational method requires Legal/Security approval.
- Audit evidence retains only reference, actor ID, action, key ID, reason category and timestamps. Free-text reasons are forbidden.
- Backup expiry and restored-dataset deletion reconciliation are launch gates; deletion is not proven only because the primary document disappeared.

## Logging and observability allowlist

Permitted: route template, status class, bounded latency, response size bucket, random request correlation ID, generic error code, queue depth and aggregate counts.

Forbidden: request/response bodies, ciphertext, encrypted field values, references in metrics, email or organisation identifiers, IP addresses, user agents, filenames, subjects, free text, private/public keys, cryptographic nonces and authentication tags.

Room routes must bypass generic body capture and session-replay tooling. Operational dashboards use aggregates only. Alert notifications identify the failing component and generic condition, never a submission.

## Failure behavior

- If the public-key manifest cannot be authenticated or is outside its validity window, fail closed before the user can enter sensitive text and offer a non-confidential contact route with a warning.
- If local encryption fails, do not transmit or persist any draft; explain that the confidential channel is unavailable.
- If ciphertext persistence is uncertain, return no success claim. A retry may use the same idempotency token without duplicating a submission.
- If notification delivery fails, retain the queued reference-only notification and retry without exposing content. Submission receipt must not depend on email success.
- If decryption or recipient-key access fails, leave ciphertext untouched, record a metadata-only failure event and enter the approved recovery runbook.
- If deletion fails, alert on the reference-free aggregate and retry; a record past deadline must not appear in the normal inbox.

## Required decisions before implementation

1. Security approves the browser cryptographic suite, library, envelope format, key rotation and forward/backward decryption windows.
2. Principal and Security approve hardware custody, designate onboarding, lost-key recovery and emergency revocation without a server-side decryption backdoor.
3. Architecture approves whether the restricted decrypting client uses a separate origin and deployable from the general Admin/CMS.
4. Legal approves lawful basis, bilingual notices, procurement prohibition, 180-day schedule, extension/legal-hold authority and subject-access/erasure process.
5. Infrastructure approves Room-only database/storage credentials, encrypted backup scope, key custody, restore reconciliation and access evidence.
6. Security approves bot/rate controls that do not inspect or persist content and commissions an independent Room-focused penetration test.

## Acceptance evidence

AMANOR-092 can enter review when this model is traceable to the brief and architecture, includes assets, actors, trust boundaries, misuse cases, retention and failure behavior, and names every approval dependency. It cannot be accepted until Legal and an independent Security reviewer sign the model.

AMANOR-093-096 must each produce direct tests for their applicable rows above. AMANOR-097 requires an independent penetration-test report with every high and critical finding closed and retested. Production also requires a key-loss recovery drill, ciphertext-only database inspection, database permission-denial proof, 180-day deletion/restore rehearsal and a browser review confirming no Room data reaches caches, logs, analytics, email or error reporting.
