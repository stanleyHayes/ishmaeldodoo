# Deployed observability acceptance record

- Status: `Not run`
- Environment, release and immutable source revision: `Not recorded`
- Web, Admin and API deployment revisions: `Not recorded`
- Public, Admin and API origins: `Not recorded`
- Monitoring, logging and tracing providers plus regions: `Not selected`
- Provider account/resource identifiers and evidence location: `Not recorded`
- Collector, dashboard, alert-rule and uptime-target revisions: `Not recorded`
- Exercise window, timezone, operators and independent observer: `Not scheduled`
- Production-like differences and accepted limitations: `Not assessed`
- Web, Admin and API uptime/TLS probe results: `Not run`
- Readiness, authenticated metrics scrape and wrong-token concealment: `Not run`
- Web proxy to API request-ID and W3C parent/child trace evidence: `Not run`
- Admin direct-call to API request-ID and W3C parent/child trace evidence: `Not run`
- API log, metric and exported-span reconciliation: `Not run`
- Normalized route, bounded labels and redacted log/span review: `Not run`
- Query, body, header, identity, IP and credential non-disclosure review: `Not run`
- OTLP collector authentication and network-boundary evidence: `Not recorded`
- Trace sampling configuration, measured rate and approval: `Not approved`
- Log, metric and trace retention/access policy and approval: `Not approved`
- Collector queue/backpressure/drop visibility result: `Not run`
- Collector-loss response-continuity and health-alert result: `Not run`
- API 5xx sustained alert delivery, acknowledgement and recovery: `Not run`
- API latency sustained alert delivery, acknowledgement and recovery: `Not run`
- Missing-metrics alert delivery, acknowledgement and recovery: `Not run`
- Single-deployable outage alert delivery, acknowledgement and recovery: `Not run`
- TLS-expiry provider-test alert delivery and acknowledgement: `Not run`
- Calendar synchronization failure alert and recovery: `Not run`
- Principal decision delivery failure alert and recovery: `Not run`
- Protocol, Room and personal-data retention alert routing review: `Not run`
- Primary and secondary on-call routes, escalation times and evidence: `Not recorded`
- Dashboard baseline, SLOs and release/incident annotations: `Not approved`
- Fault-injection removal and temporary-access revocation: `Not run`
- Defects, severity, owners, target dates and retest evidence: `None recorded`
- Operations approval and date: `Not approved`
- Security approval and date: `Not approved`
- Privacy approval and date: `Not approved`
- Product acceptance and date: `Not approved`

## Evidence rules

Complete this record only against the exact release named above in
production-like staging. Link immutable provider exports, redacted query results,
screenshots or recordings and alert notification/acknowledgement events; do not
paste credentials, bearer tokens, signed endpoints, personal data, request
bodies, confidential Room material or unredacted logs into this repository.

The Web and Admin correlation exercises must each begin at their deployed origin
and prove the API server span is a child of the propagated W3C context. A shared
request ID alone is insufficient. Reconcile the corresponding API completion
event, normalized Prometheus series and exported span without using an identity,
IP address or payload as a join key.

Exercise collector loss and alert routes with controlled, reversible staging
faults. Record injection, pending, firing, delivery, acknowledgement, recovery
and cleanup timestamps. Missing notification, application impact from collector
loss, sensitive telemetry, unresolved high/critical defects or absent approval
blocks release; it must not be converted into a pass by editing pending labels.
