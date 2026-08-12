# UAT, beta, launch, acceptance and hypercare

These controlled templates preserve one evidence chain from the reviewed release candidate through project closure. Creating or validating a template is not evidence that its activity occurred.

## Sequence and authority

1. QA opens the UAT report only after a signed, QA-passed staging release candidate exists. Product owns acceptance criteria; defects remain separate from enhancement requests.
2. Product authorises a bounded beta only after UAT approval. Privacy and Security approve cohort, telemetry and incident boundaries.
3. The Release Manager executes content freeze and production promotion using the exact reviewed image digests and configuration revisions. Engineering and Operations own the rollback watch.
4. The Principal and authorised delivery representatives sign final acceptance only after production validation and the handover demonstration.
5. Operations runs the approved hypercare window, classifies incidents/defects/enhancements separately and transfers every open item to a named owner.
6. The Delivery Lead closes the project only after support transition and evidence-archive verification.

## Controlled templates

- [UAT report](templates/uat-report.md)
- [Limited beta report](templates/beta-report.md)
- [Production launch record](templates/production-launch-record.md)
- [Acceptance certificate](templates/acceptance-certificate.md)
- [Hypercare report](templates/hypercare-report.md)
- [Project closure record](templates/project-closure-record.md)

Every template starts `Not run`, `Not approved`, or `Not signed`. Replace those values only with dated evidence from the named authority. Never paste credentials, Room ciphertext/plaintext, request bodies, personal contact details, analytics raw exports or provider tokens into these records.

`npm run check:acceptance-evidence` validates structure and the exact
pre-execution status, approval and signature sentinels for every stage. Leaving
one unrelated `Not run` value in a record does not permit its stage status or
required signatures to claim completion. Before the first real execution,
extend the validator in the same reviewed change to validate that stage's dated
evidence references and complete authority set; do not simply remove the
pending-state checks. The validator cannot approve UAT, beta, launch, handover,
hypercare or closure.
