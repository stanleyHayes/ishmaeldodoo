# Product measurement dashboard

- Status: Provider-neutral definition complete; deployment and production QA required
- Scope: AMANOR-131
- Manifest: `infra/analytics/product-dashboard.json`
- Event policy: [analytics event catalogue](analytics-event-catalogue.md)

The manifest defines eight outcome panels without creating a second analytics store. It uses only the eight consent-gated events already accepted by the runtime catalogue and the existing aggregate Protocol Desk SLA metric. Signals and Office Hours readership are derived from allowlisted route-level `pageview` counts; no content slug, question, entrant, request or Atlas record identifier is collected.

Analytics panels suppress groups below ten events and expose no raw-event download. A zero denominator renders unavailable rather than zero percent. The operational SLA panel contains only aggregate escalation type/count state and must never gain a request-reference label.

## Deployment procedure

1. Privacy/Legal approves the catalogue, consent wording, provider, region, retention and minimum group threshold.
2. Configure the independently deployed public web with the approved event endpoint and site ID; do not forward browser headers or cookies.
3. Translate each manifest panel into the provider's saved query without adding dimensions. Keep the manifest panel ID as the provider dashboard key.
4. Configure read-only dashboard access for approved Product/Content/Operations roles; disable raw-event and visitor export.
5. Set the dashboard timezone to Africa/Accra and default window to 30 days. Preserve locale and mode comparisons, including suppressed/empty states.
6. Link the existing Prometheus Desk SLA panel or approved read-only aggregate datasource; never join operational request data to analytics events.

## Event QA

Use synthetic non-personal sessions in protected staging and record provider query screenshots/timestamps:

1. With no consent and with refusal, exercise each instrumented path and prove the provider count remains unchanged.
2. Grant consent, emit a known count for all eight event names, then prove exact provider ingestion counts and allowed route/locale/audience/mode dimensions.
3. Attempt unknown events, query-string routes, extra properties, identity/contact fields, request/reference IDs and record IDs; prove rejection before provider delivery.
4. Prove provider outage or timeout returns no-content within the application deadline and does not block the user journey.
5. Populate nine events in one group and prove suppression; add the tenth and prove the aggregate appears without exposing constituent events.
6. Prove Desk funnel zero-denominator behavior, Sahel share arithmetic and French/English route grouping.

## Screenshot evidence

Capture the deployed dashboard at desktop and a narrow operator viewport for 24-hour, 30-day and empty/suppressed states. Evidence must show all eight manifest panel IDs, provider/dashboard revision, environment, UTC capture time, applied window and filters. Crop or redact account identifiers; screenshots must contain no personal data or raw event table.

## Data-quality review

Monthly, compare expected product releases and synthetic canaries to event volume, check locale/mode coverage, inspect sudden zeros or duplicates, confirm suppression and validate that the provider schema has not gained dimensions. Record discrepancies, owner, severity, remediation date and whether historical aggregates need annotation. Do not backfill fabricated events.

The first six-month outcome report may use only aggregate, quality-reviewed results. Reach means consent-qualified page views, not unique people or the whole audience. Office Hours readership is not participation, and Desk completion is not acceptance. Those distinctions must remain visible in reports.

Before provider deployment, `npm run check:analytics` runs non-personal synthetic events through the provider-neutral panel semantics. It verifies route filters, locale/mode grouping, exact counts, Desk completion arithmetic, Sahel share arithmetic, and suppression at nine events followed by release at ten. This local gate does not replace the staging provider-ingestion and screenshot evidence above.

Record the S04 outcome, exact deployed release/provider/dashboard revisions,
consent and ingestion QA, privacy settings, screenshots, cleanup, defects and
approvals in the controlled
[deployed analytics acceptance record](templates/deployed-analytics-acceptance-record.md).
Pending fields keep AMANOR-035/131 open; a successful local event or dashboard
test is not provider acceptance.
