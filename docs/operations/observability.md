# Observability runbook

## Correlation contract

Every Admin/CMS and public-server call to the NestJS API carries both:

- `X-Request-ID`: a bounded operational lookup key. NestJS accepts only 1-128 characters from the ASCII alphanumeric, dot, underscore, colon and hyphen set; malformed values are replaced.
- `traceparent`: W3C Trace Context version `00`. NestJS retains a valid incoming trace ID, creates a new server span ID and returns the resulting header. Invalid or all-zero identifiers start a new sampled trace.

The Admin API client creates both identifiers for direct browser-to-API calls. Public Web mutation and download proxies validate and preserve safe inbound identifiers, send them to NestJS, and return NestJS's child-span `traceparent` plus the shared request ID. Malformed, overlong or all-zero metadata is replaced before forwarding. This covers Protocol Desk, general/media enquiries, Press Kit, Living Dossier and both Room proxy routes without placing requester data in correlation metadata.

The API completion event writes `requestId`, `traceId`, `spanId` and, when present, `parentSpanId`. This provides a stable join across independently deployed application logs before a telemetry exporter is selected.

## Logging and privacy

API access logs are newline-delimited JSON on stdout for collection by the deployment platform. They contain only service, HTTP method/path/status, duration and correlation identifiers. Query strings and request/response bodies are excluded. The shared JSON redactor replaces authorization, cookie, password, secret, token, email, phone, body and payload fields before serialization.

Never add headers, bodies, contact information, JWT claims, signed URLs or provider credentials to completion events. New structured events must use the shared redactor and receive an adversarial redaction test.

## Operator lookup

1. Start with the `X-Request-ID` shown in an API error envelope or response header.
2. Find the API completion event with the same `requestId`.
3. Use `traceId` to join upstream public-web or Admin/CMS events and any future OpenTelemetry backend.
4. Use span/parent-span identifiers to establish ordering; never infer identity or authorization from correlation metadata.

## Metrics scrape

NestJS exposes Prometheus text at `GET /v1/internal/metrics`. The route is deliberately concealed with `404` unless the exact `Authorization: Bearer <METRICS_BEARER_TOKEN>` credential is supplied. Production configuration requires a random token of at least 32 characters. Restrict the route to the private monitoring network as an additional control and rotate the token through the deployment secret manager.

The `amanor_http_request_duration_seconds` histogram uses method, normalized route and status class only. Numeric, Mongo ObjectId and UUID path segments become `:id`; oversized paths collapse to `/overflow`. It never labels metrics with request IDs, trace IDs, query strings, users, IP addresses or content values. The fixed buckets are 10 ms, 25 ms, 50 ms, 100 ms, 250 ms, 500 ms, 1 s, 2.5 s and 5 s.

Portable deployment artifacts live in `infra/observability`: Prometheus alert rules and a provisionable Grafana dashboard for request rate, 5xx ratio, p95 latency and normalized-route traffic. Run `npm run check:observability` whenever these artifacts or the emitted series change.

Independent uptime checks use the Blackbox Exporter configuration and three-target inventory in the same directory. Copy `uptime-targets.example.yml` into provider configuration only after D01 confirms the real domains; reserved `.example` names must never be deployed. Probe public web `/`, the protected Admin/CMS entry response and API `/v1/health/ready` separately over TLS. Preserve the `service` label so alerts identify the failed deployable. `AmanorDeploymentUnavailable` pages after three failed minutes, while `AmanorTlsCertificateExpiring` opens a ticket with fourteen days remaining.

## Alert drill and response

Perform this drill in staging after every monitoring-provider or routing change:

1. Confirm an authenticated scrape succeeds and an incorrect token returns `404`.
2. Generate sustained synthetic 5xx traffic against a non-mutating staging-only fault route or provider-supported test target; never corrupt data to trigger an alert.
3. Verify `AmanorApiHighErrorRate` enters pending after the ratio exceeds 5%, fires after ten minutes, pages the primary on-call route and links back to this runbook.
4. Apply a reversible latency injection at the staging proxy and verify `AmanorApiHighLatency` creates a ticket only after ten sustained minutes above one-second p95.
5. Pause only the staging scrape job and verify `AmanorApiMetricsMissing` pages after five minutes; restore it immediately.
6. Route the staging trace exporter to a controlled unavailable collector while continuing harmless API requests. Verify responses remain successful, `amanor_telemetry_export_healthy` becomes `0`, `AmanorTelemetryExportFailure` creates a ticket after two minutes and health returns to `1` after collector recovery. The dashboard and alert must expose no endpoint, provider error or span content.
7. Route one staging black-box target to a controlled `503`; verify `AmanorDeploymentUnavailable` fires after three minutes and names only the affected service. Restore it and verify recovery. Use a provider test series, not a real certificate change, to exercise `AmanorTlsCertificateExpiring`.
8. Use the calendar adapter's staging failure mode to leave one synthetic synchronization job failed for two minutes. Verify `AmanorProtocolDeskCalendarSyncFailure` pages, the dashboard shows only aggregate status counts, Admin exposes the matching bounded job, and the failed-only retry completes after service restoration.
9. Record timestamps for injection, pending, firing, notification, acknowledgement and recovery. Confirm the dashboard contains no personal data, query strings or unnormalized identifiers.
10. Attach the evidence to AMANOR-033/087/176 and remove all fault injection. A failed notification, missing recovery or sensitive label blocks release.

Production response starts by checking readiness and recent release/configuration changes, then uses normalized route and status-class panels to narrow impact. Roll back the application or configuration when a recent change correlates with the breach. Do not silence an alert without a time-bounded incident record and named owner.

## Remaining production gates

The observability provider is deliberately undecided. NestJS optionally exports server spans over provider-neutral OTLP/HTTP when `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is configured. Root sampling defaults to `0.1` and is bounded to `0..1` by `OTEL_TRACE_SAMPLE_RATIO`; an accepted upstream sampling decision is preserved. Export uses a 512-span queue, 64-span batches and a three-second timeout, runs after request completion and never blocks the product response. Span attributes contain only service/version, normalized path, HTTP method and status—never request IDs, query strings, IP addresses, identities, headers or bodies. Collector authentication must use a private network or workload identity rather than credentials embedded in the endpoint.

Before launch, select and deploy the collector/provider independently per environment, connect the scrape endpoint to dashboards and alerts, validate sampling and retention, prove redaction in staging and run an alert/trace drill. Confirm a Web/Admin-propagated trace ID reaches the API child span and that collector loss does not change an application response.
