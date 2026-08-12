# Image registry, signing and provenance acceptance record

- Status: `Not run`
- Environment, release and immutable source revision: `Not recorded`
- Registry provider, account, region and repository identifiers: `Not selected`
- Build workflow run, runner identity and trusted-builder revision: `Not recorded`
- Signing method, issuer and expected identity policy: `Not approved`
- Transparency log or managed audit-log evidence: `Not recorded`
- Registry tag immutability and digest-only deployment proof: `Not run`
- Registry retention, deletion protection and vulnerability-rescan policy: `Not approved`
- Build isolation, least privilege and credential-lifetime evidence: `Not run`

## Independently deployable artifacts

<!-- prettier-ignore -->
| Deployable | Registry digest | Signature/bundle reference | Provenance/attestation reference | SPDX SBOM digest | SARIF/scan result | Verification result |
| ---------- | --------------- | -------------------------- | -------------------------------- | ---------------- | ----------------- | ------------------- |
| Public Web | Not recorded    | Not recorded               | Not recorded                     | Not recorded     | Not run           | Not run             |
| Admin/CMS  | Not recorded    | Not recorded               | Not recorded                     | Not recorded     | Not run           | Not run             |
| NestJS API | Not recorded    | Not recorded               | Not recorded                     | Not recorded     | Not run           | Not run             |

## Promotion and recovery

- Source revision and lockfile digests match provenance subjects: `Not run`
- Provenance builder/workflow/ref/repository identity verified: `Not run`
- Signature identity and certificate/managed-key policy verified: `Not run`
- Signature, provenance, SBOM and scan all bind each exact image digest: `Not run`
- High/critical fixable vulnerability result is zero for all three images: `Not run`
- Render/Vercel release artifacts map to the reviewed deployable digests: `Not run`
- Promotion rejects unsigned, mismatched, mutable-tag and untrusted-builder artifacts: `Not run`
- Prior Web/Admin/API rollback digests remain available and verifiable: `Not run`
- Signing identity/key compromise, revocation and emergency rebuild drill: `Not run`
- Superseded test tags/artifacts and temporary credentials removed: `Not run`
- Defects, severity, owners, target dates and retest evidence: `None recorded`
- Engineering/Release approval and date: `Not approved`
- Security approval and date: `Not approved`
- Operations acceptance and date: `Not approved`

## Evidence rules

Complete this record only after the selected registry and trusted build identity
exist. Every signature, provenance statement, SBOM and scan result must bind the
same immutable `sha256` digest for its deployable; matching a mutable tag or
source revision alone is insufficient. Prefer short-lived workload identity and
keyless signing, or document managed-key custody, rotation and revocation.

Link durable provider exports, public transparency-log entries where applicable
and verification output. Never copy registry credentials, signing keys, OIDC
tokens or private provider URLs into this repository. Missing provenance,
unverifiable identity, digest mismatch, unavailable rollback artifact,
unresolved high/critical fixable finding or absent approval blocks promotion.
