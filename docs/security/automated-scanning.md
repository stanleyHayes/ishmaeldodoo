# Automated security scanning

## Pull-request and main-branch gates

The repository uses separate controls with distinct evidence:

- CodeQL scans all JavaScript and TypeScript plus GitHub Actions workflow code on pull requests, pushes to `main`, manual dispatch and a weekly schedule. The two analyses run independently, use GitHub's extended security query suite and publish findings to code scanning.
- Gitleaks checks the complete Git history for committed credentials.
- `npm audit --omit=dev --audit-level=high` blocks high or critical production dependency findings.
- Anchore generates an SPDX SBOM and scans each independently deployed API, public Web and Admin/CMS image. A fixable high or critical finding fails its image job. Each SARIF report is uploaded to code scanning and retained for 90 days.
- Project-owned policy gates exercise secret signatures, deployment boundaries, CSP/origin controls, unsafe inputs and security invariants. These complement SAST; they do not replace it.

The root `check:security-ci` command verifies that the hosted workflow cannot silently lose CodeQL, its extended query suite, required permissions, weekly schedule, any deployable image, high-severity failure policy or SARIF upload.

## Triage and release policy

Security owns code-scanning triage. A high or critical finding blocks release until fixed and rescanned. A false-positive dismissal requires a dated rationale and Security approval in the provider, not a workflow suppression committed by an engineer. Lower-severity accepted risk requires an owner, expiry date and remediation ticket.

Generated SARIF, SBOM and scanner logs may contain repository paths and package metadata but must never contain runtime environment files, request bodies, recipient details or credentials. Retain hosted reports with the release candidate record.

## Evidence still requiring deployed staging

CodeQL and image scanning do not prove runtime security. Authenticated DAST for Admin/CMS, Protocol Desk and The Room; TLS/hosting configuration review; infrastructure/IAM scanning; and the independent penetration test remain staging release gates. Store only redacted reports and remediation/retest evidence.
