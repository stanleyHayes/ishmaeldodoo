# Measurement and outcome reporting cadence

- Status: Operating framework ready; first cycle starts at production launch
- Scope: AMANOR-132
- Machine-readable targets: `infra/analytics/outcome-framework.json`
- Dashboard definition: `infra/analytics/product-dashboard.json`
- Governing brief: Sections 1.3 and 14

Measurement exists to change a decision. It must not expand tracking simply to fill a report. Production launch is day zero; preview, staff and synthetic QA traffic are excluded from outcome baselines.

## Calendar and accountability

| Artifact                    | Due                                    | Preparer                           | Decision owner | Retention                         |
| --------------------------- | -------------------------------------- | ---------------------------------- | -------------- | --------------------------------- |
| Monthly one-page digest     | Fifth business day after month end     | Product Lead                       | Principal      | Approved reporting archive        |
| Monthly data-quality review | Before the digest                      | Product/Engineering/Privacy owners | Product Lead   | Approved reporting archive        |
| Quarterly product review    | Tenth business day after quarter end   | Product Lead                       | Principal      | Product decision log              |
| Six-month outcome report    | Fifteenth business day after month six | Product Lead                       | Principal      | Handover/outcome evidence archive |

Named people and approved storage locations must be recorded before launch. The Principal receives a one-page, plain-language monthly digest answering exactly three questions: is the record reaching the right people, is the Desk working, and is the youth pipeline alive. Supporting diagnostics remain in the data-quality record rather than adding unsolicited charts.

## Evidence states

Every metric must use exactly one state:

- `Observed`: quality-reviewed aggregate evidence exists for the stated window.
- `Suppressed`: the group is below the approved minimum threshold; never infer or display the hidden count.
- `Unavailable`: the provider, method or quality gate cannot support the measure.
- `Not launched`: the dependent feature was not live for the full measurement window.

Zero is an observed numeric result, not a synonym for unavailable or not launched. Never estimate missing events, retroactively backfill fabricated events, reinterpret consent-qualified page views as unique people, or silently change a denominator.

## Monthly process

1. Freeze the reporting window and record deployment, dashboard and event-catalogue revisions.
2. Complete the [data-quality review template](templates/monthly-data-quality-review.md), including consent, suppression, duplicates, outages, release changes and bilingual parity.
3. Reconcile Desk aggregates against operational state without exporting request-level data.
4. Complete the [monthly digest](templates/monthly-measurement-digest.md) using only quality-approved results.
5. Principal records one decision per question or explicitly records `No change` with a reason.
6. Archive the signed digest and quality record; create owned actions with dates in the delivery ledger.

## Quarterly process

Use the [quarterly review template](templates/quarterly-product-review.md) to compare three monthly windows, determine what to build, stop or investigate next, and inspect whether metrics still answer decisions. Metric additions require Privacy review and catalogue/schema changes before collection begins; they cannot be smuggled into a dashboard query.

## Six-month process

Use the [six-month report template](templates/six-month-outcome-report.md). Preserve all eight brief targets exactly, show numerator/denominator and method where applicable, disclose feature exposure and data-quality limitations, and separate correlation from causal claims. A missed or unmeasurable target is reported honestly with an owner/date; it is never removed from the scorecard.

Search-result ownership and canonical-title adoption are controlled manual audits with dated query/article populations and reviewer evidence. Atlas median duration is currently unavailable because the approved event catalogue intentionally does not collect duration. Office Hours and The Room remain `Not launched` until their separately gated features ship. Those facts may change only through approved product/privacy/security decisions and current runtime evidence.

Before production launch, `npm run check:analytics` binds the exact pending
monthly quality/digest, quarterly review and six-month baseline/outcome/sign-off
states. One remaining `Not run` or `Not launched` field cannot conceal a
premature measurement or outcome claim. Before the first real cycle, extend the
validator in the same reviewed change to require immutable release/catalogue
revisions, complete upstream record references, approved evidence-state values,
durable aggregate/manual-audit evidence, owned decisions and the complete dated
approval set; do not delete the pending-state guard without an executed-state
replacement.
