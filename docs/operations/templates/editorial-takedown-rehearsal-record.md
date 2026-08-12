# Editorial takedown and recovery rehearsal record

- Status: `Not run`
- Environment, release and three deployment revisions: `Not recorded`
- Exercise window, incident reference and time source: `Not scheduled`
- Synthetic document type, document ID and affected locale: `Not recorded`
- Published bad-content version and correct restoration version: `Not recorded`
- Principal/Reviewer authorisation and operator MFA evidence: `Not recorded`
- Admin, API and public-web separation evidence: `Not recorded`

## Bad-content takedown

- Authorised decision/start timestamp: `Not recorded`
- Mongo publication-pointer transaction and `unpublished` event: `Not run`
- Takedown revalidation outbox queued/delivered and alert state: `Not run`
- Origin and CDN/edge unavailable timestamps: `Not recorded`
- Sitemap, feed, llms.txt, structured-data and public-API removal: `Not run`
- Valid exported audit-chain evidence: `Not recorded`
- Narrow emergency purge action/reason, if any: `None`
- Takedown end timestamp and elapsed result below 15 minutes: `Not run`

## Mistaken-takedown recovery

- Authorised recovery/start timestamp: `Not recorded`
- Exact immutable version restored without historical mutation: `Not run`
- Mongo publication-pointer transaction and `rolled_back` event: `Not run`
- Recovery revalidation outbox queued/delivered and alert state: `Not run`
- Origin and CDN/edge restored timestamps: `Not recorded`
- Sitemap, feed, llms.txt, structured-data and public-API restoration: `Not run`
- Valid exported audit chain includes takedown and recovery: `Not recorded`
- Recovery end timestamp and elapsed result below 15 minutes: `Not run`

- Unaffected locale/document and independent code releases unchanged: `Not run`
- Synthetic content and temporary-access cleanup: `Not run`
- Sensitive-content, personal-data and credential non-disclosure review: `Not run`
- Defects, owners, dates and successful retest evidence: `None recorded`
- Operations approval/date: `Not approved`
- Product approval/date: `Not approved`
- Security approval/date: `Not approved`
- Content approval/date: `Not approved`

Use approved synthetic content in production-like staging. Both scenarios have
independent 15-minute clocks beginning at their authorised decision. Retain
durable HTTP, provider, outbox and audit-envelope evidence without copying
unpublished content, personal data, credentials, tokens or restricted audit
payloads into this repository. A fast Admin confirmation alone is not public
removal proof; both origin and CDN/edge plus every discoverability surface must
converge. Code rollback timing remains in the release-candidate record.
