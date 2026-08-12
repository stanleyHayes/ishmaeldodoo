# Deployed analytics acceptance record

- Status: `Not run`
- S04 decision and approval evidence: `Not approved`
- Environment, release and immutable source revision: `Not recorded`
- Public Web origin and deployment revision: `Not recorded`
- Analytics provider, hosting region and processor record: `Not selected`
- Provider site/resource and dashboard revision identifiers: `Not recorded`
- Event catalogue, consent-copy and dashboard-manifest revisions: `Not recorded`
- Exercise window, timezone, operators and independent observer: `Not scheduled`
- Production-like differences and accepted limitations: `Not assessed`
- English and French consent wording/version approved: `Not approved`
- Six-month consent-choice lifetime and withdrawal behavior: `Not approved`
- No-choice and refusal produce zero provider events: `Not run`
- Consent grant enables collection only after the recorded choice: `Not run`
- Consent withdrawal stops subsequent provider events: `Not run`
- All eight exact event names ingested at expected counts: `Not run`
- Route, locale, audience and mode dimensions match the catalogue: `Not run`
- Unknown event, query route and extra-property rejection: `Not run`
- Identity, contact, request, record and content-field rejection: `Not run`
- Browser headers, cookies, IP, user agent and referrer non-disclosure: `Not run`
- Provider timeout/outage preserves the user journey and bounded response: `Not run`
- Duplicate, delayed and replayed event behavior reconciled: `Not run`
- Nine-event group suppressed and tenth-event aggregate released: `Not run`
- Raw-event and visitor export disabled with access-denial proof: `Not run`
- Eight dashboard panel IDs and saved-query parity: `Not run`
- Desk zero denominator, Sahel share and bilingual grouping QA: `Not run`
- Desk SLA aggregate datasource joined without request data: `Not run`
- Africa/Accra timezone and 30-day default window: `Not run`
- Desktop and narrow 24-hour/30-day/empty/suppressed screenshots: `Not recorded`
- Read-only Product/Content/Operations role access verified: `Not run`
- Provider retention, deletion/access process and data location: `Not approved`
- Synthetic events and temporary access removed after exercise: `Not run`
- Baseline annotation and first monthly quality-review owner/date: `Not recorded`
- Defects, severity, owners, target dates and retest evidence: `None recorded`
- Privacy/Legal approval and date: `Not approved`
- Product approval and date: `Not approved`
- Engineering approval and date: `Not approved`

## Evidence rules

Complete this record against the exact production-like staging release and the
S04 outcome recorded in the controlled decision register. If S04 selects
`no-analytics`, replace the provider exercises with signed proof that analytics
configuration is absent, the consent control is not misleadingly presented and
all provider delivery remains disabled; do not fabricate ingestion evidence.

For an enabled provider, link immutable or exported configuration, redacted
queries, aggregate screenshots and timestamped synthetic counts. Never place
raw event rows, visitor identifiers, IP addresses, headers, cookies, account
credentials, request data or provider tokens in this repository. Missing
consent silence, extra dimensions, raw export, unresolved high/critical defects
or absent approval blocks production promotion.
