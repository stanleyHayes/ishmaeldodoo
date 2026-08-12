# CodeQL triage record

- Status: `Awaiting Security approval`
- Repository: `stanleyHayes/ishmaeldodoo`
- Source revision: `6aee5edab61774fb4549092b0df3892e5f5171d1`
- Hosted CodeQL run: `31557453253` (`success`)
- Open-alert snapshot before OpenAPI boundary remediation: `8`
- Engineering reviewer and date: `Codex — 12 Aug 2026`
- Security approver and date: `Not approved`

This record does not dismiss findings. Security must independently confirm the
exact source and destination boundaries below, record its decision in GitHub,
and add the dated provider evidence. High-severity alerts remain release
blocking until fixed or approved as false positives.

| Alerts | Severity | Flow                                                                                 | Fixed boundary and safeguards                                                                                                                                                            | Proposed disposition                                                        | Security decision/evidence |
| ------ | -------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| 15-16  | High     | Rotated opaque refresh token to Admin browser cookie                                 | Host-only `__Host-` cookie; `Secure`, `HttpOnly`, `SameSite=Strict`, path `/`; only a server-side hash is persisted; five-minute JWT remains in memory                                   | False positive: intentional session-cookie issuance, not credential storage | Not approved               |
| 21     | Medium   | Generated Protocol Note PDF to the Principal through Resend                          | Fixed HTTPS endpoint, redirects rejected, configured sole active Principal recipient, idempotency key, bounded PDF generator and request timeout                                         | False positive: required controlled Principal delivery                      | Not approved               |
| 22     | Medium   | Generated acceptance Protocol Note to the validated request recipient through Resend | Fixed HTTPS endpoint, redirects rejected, recipient comes from validated Protocol request, idempotency key and request timeout                                                           | False positive: required controlled correspondence                          | Not approved               |
| 23-24  | Medium   | Synthetic load-plan data to staging public/Protocol routes                           | Operator-supplied plan is schema validated, origin is staging-only, edge authorization is mandatory, redirects rejected, synthetic non-delivering payload and bounded timeouts           | False positive: authorized staging rehearsal                                | Not approved               |
| 25     | Medium   | Escaped HTML written to a private temporary file for local Chromium PDF generation   | `mkdtemp`, mode `0600`, fixed filenames under the unique directory, executable invoked without a shell, network disabled, PDF signature/20 MiB bound and unconditional recursive cleanup | False positive: local document rendering, not network download              | Not approved               |

## Approval checklist

- [ ] Security independently inspected every cited source line and upstream data path.
- [ ] Alert 15-16 cookie attributes and server-side token hashing were verified.
- [ ] Alerts 21-22 provider destination, recipient derivation and generated attachment scope were verified.
- [ ] Alerts 23-24 staging authorization, schema validation and synthetic-data-only constraint were verified.
- [ ] Alert 25 temporary-directory isolation, Chromium network controls, output validation and cleanup were verified.
- [x] Alert 26 remediated: generation/check now reject remote, credentialed,
      wrong-path, query and fragment sources and reject redirects; hosted rescan pending.
- [ ] Each approved dismissal is recorded in GitHub with reviewer, date and this revision.
- [ ] Any rejected rationale has a remediation owner, target date and successful rescan.
- [ ] Final open high/critical count is zero or carries authorized release-risk evidence.

No approval may be inferred from a successful CodeQL run or this engineering
rationale. Do not place tokens, recipient addresses, request payloads or report
exports in this record.
