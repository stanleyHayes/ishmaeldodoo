import { readFile } from "node:fs/promises";

const metric = "amanor_http_request_duration_seconds";
const rules = await readFile(
  "infra/observability/prometheus-rules.yml",
  "utf8",
);
const dashboard = JSON.parse(
  await readFile("infra/observability/grafana-dashboard.json", "utf8"),
);
const runbook = await readFile("docs/operations/observability.md", "utf8");
const deployedAcceptance = await readFile(
  "docs/operations/templates/deployed-observability-acceptance-record.md",
  "utf8",
);
const protocolCorrespondenceRunbook = await readFile(
  "docs/operations/protocol-correspondence.md",
  "utf8",
);
const ttlRetentionRunbook = await readFile(
  "docs/operations/ttl-retention-monitoring.md",
  "utf8",
);
const blackbox = await readFile(
  "infra/observability/blackbox-exporter.yml",
  "utf8",
);
const targets = await readFile(
  "infra/observability/uptime-targets.example.yml",
  "utf8",
);
const scrape = await readFile(
  "infra/observability/prometheus-scrape.example.yml",
  "utf8",
);
const correlationHelper = await readFile(
  "apps/web/src/lib/request-correlation.ts",
  "utf8",
);
const apiRequestContext = await readFile(
  "apps/api/src/common/request-context.ts",
  "utf8",
);
const apiTelemetry = await readFile("apps/api/src/common/telemetry.ts", "utf8");
const apiEnvironment = await readFile(
  "apps/api/src/config/environment.ts",
  "utf8",
);
const adminApiClient = await readFile(
  "apps/admin/src/lib/api/client.ts",
  "utf8",
);
const correlatedWebRoutes = [
  "protocol-desk",
  "contact-enquiries",
  "media-enquiries",
  "living-dossier",
  "press-kit",
  "room/enquiries",
  "room/key-manifest",
];

const pendingDeployedAcceptanceSentinels = [
  "- Status: `Not run`",
  "- Environment, release and immutable source revision: `Not recorded`",
  "- Web, Admin and API deployment revisions: `Not recorded`",
  "- Public, Admin and API origins: `Not recorded`",
  "- Monitoring, logging and tracing providers plus regions: `Not selected`",
  "- Provider account/resource identifiers and evidence location: `Not recorded`",
  "- Collector, dashboard, alert-rule and uptime-target revisions: `Not recorded`",
  "- Exercise window, timezone, operators and independent observer: `Not scheduled`",
  "- Production-like differences and accepted limitations: `Not assessed`",
  "- Web, Admin and API uptime/TLS probe results: `Not run`",
  "- Readiness, authenticated metrics scrape and wrong-token concealment: `Not run`",
  "- Web proxy to API request-ID and W3C parent/child trace evidence: `Not run`",
  "- Admin direct-call to API request-ID and W3C parent/child trace evidence: `Not run`",
  "- API log, metric and exported-span reconciliation: `Not run`",
  "- Normalized route, bounded labels and redacted log/span review: `Not run`",
  "- Query, body, header, identity, IP and credential non-disclosure review: `Not run`",
  "- OTLP collector authentication and network-boundary evidence: `Not recorded`",
  "- Trace sampling configuration, measured rate and approval: `Not approved`",
  "- Log, metric and trace retention/access policy and approval: `Not approved`",
  "- Collector queue/backpressure/drop visibility result: `Not run`",
  "- Collector-loss response-continuity and health-alert result: `Not run`",
  "- API 5xx sustained alert delivery, acknowledgement and recovery: `Not run`",
  "- API latency sustained alert delivery, acknowledgement and recovery: `Not run`",
  "- Missing-metrics alert delivery, acknowledgement and recovery: `Not run`",
  "- Single-deployable outage alert delivery, acknowledgement and recovery: `Not run`",
  "- TLS-expiry provider-test alert delivery and acknowledgement: `Not run`",
  "- Calendar synchronization failure alert and recovery: `Not run`",
  "- Principal decision delivery failure alert and recovery: `Not run`",
  "- Protocol, Room and personal-data retention alert routing review: `Not run`",
  "- Primary and secondary on-call routes, escalation times and evidence: `Not recorded`",
  "- Dashboard baseline, SLOs and release/incident annotations: `Not approved`",
  "- Fault-injection removal and temporary-access revocation: `Not run`",
  "- Defects, severity, owners, target dates and retest evidence: `None recorded`",
  "- Operations approval and date: `Not approved`",
  "- Security approval and date: `Not approved`",
  "- Privacy approval and date: `Not approved`",
  "- Product acceptance and date: `Not approved`",
];

function validatePendingDeployedAcceptance(candidate) {
  for (const sentinel of pendingDeployedAcceptanceSentinels)
    if (!candidate.includes(sentinel))
      throw new Error(
        `Deployed observability record no longer proves its pending state: ${sentinel}`,
      );
}

validatePendingDeployedAcceptance(deployedAcceptance);
for (const sentinel of pendingDeployedAcceptanceSentinels) {
  const mutated = deployedAcceptance.replace(sentinel, "[prematurely changed]");
  try {
    validatePendingDeployedAcceptance(mutated);
  } catch {
    continue;
  }
  throw new Error(
    `Deployed observability record accepted mutation of required sentinel: ${sentinel}`,
  );
}

const requiredAlerts = [
  "AmanorApiHighErrorRate",
  "AmanorApiHighLatency",
  "AmanorApiMetricsMissing",
  "AmanorTelemetryExportFailure",
  "AmanorProtocolDeskResponseSlaOverdue",
  "AmanorProtocolDeskDeliveryFailure",
  "AmanorProtocolDeskCalendarSyncFailure",
  "AmanorPrincipalDecisionDeliveryFailure",
  "AmanorRoomRetentionDeletionFailure",
  "AmanorRoomRetentionOverdue",
  "AmanorRoomRetentionScanFailure",
  "AmanorPersonalDataRetentionOverdue",
  "AmanorPersonalDataRetentionScanFailure",
  "AmanorDeploymentUnavailable",
  "AmanorTlsCertificateExpiring",
];
for (const alert of requiredAlerts) {
  if (!rules.includes(`alert: ${alert}`))
    throw new Error(`Missing alert rule ${alert}`);
}
if (
  !rules.includes(
    'amanor_protocol_desk_calendar_sync_jobs{status="failed"} > 0',
  ) ||
  !JSON.stringify(dashboard).includes("amanor_protocol_desk_calendar_sync_jobs")
)
  throw new Error("Calendar synchronization alert/dashboard wiring is missing");
if (
  !rules.includes(
    'amanor_protocol_desk_principal_decision_deliveries{status="failed"} > 0',
  ) ||
  !JSON.stringify(dashboard).includes(
    "amanor_protocol_desk_principal_decision_deliveries",
  ) ||
  !rules.includes(
    "docs/operations/protocol-correspondence.md#principal-decision-alert-response",
  ) ||
  !protocolCorrespondenceRunbook.includes(
    "### Principal decision alert response",
  ) ||
  !protocolCorrespondenceRunbook.includes("exactly one active") ||
  !protocolCorrespondenceRunbook.includes("returns to zero")
)
  throw new Error(
    "Principal decision delivery alert, dashboard, or response wiring is missing",
  );
for (const metricName of [
  "amanor_room_retention_due",
  "amanor_room_retention_failed",
  "amanor_room_retention_oldest_overdue_seconds",
  "amanor_room_retention_scan_healthy",
]) {
  if (!JSON.stringify(dashboard).includes(metricName))
    throw new Error(`Room retention dashboard is missing ${metricName}`);
}
for (const alertMetric of [
  "amanor_room_retention_failed",
  "amanor_room_retention_oldest_overdue_seconds",
  "amanor_room_retention_scan_healthy",
])
  if (!rules.includes(alertMetric))
    throw new Error(`Room retention alerting is missing ${alertMetric}`);
if (
  !rules.includes("amanor_room_retention_oldest_overdue_seconds > 4500") ||
  !rules.includes("docs/security/room-operations.md#incidents")
)
  throw new Error(
    "Room retention overdue threshold or runbook wiring is missing",
  );
for (const metricName of [
  "amanor_personal_data_retention_due",
  "amanor_personal_data_retention_oldest_overdue_seconds",
  "amanor_personal_data_retention_scan_healthy",
])
  if (!JSON.stringify(dashboard).includes(metricName))
    throw new Error(`TTL retention dashboard is missing ${metricName}`);
if (
  !rules.includes(
    "max(amanor_personal_data_retention_oldest_overdue_seconds) > 7200",
  ) ||
  !rules.includes("amanor_personal_data_retention_scan_healthy == 0") ||
  !rules.includes(
    "docs/operations/ttl-retention-monitoring.md#alert-response",
  ) ||
  !ttlRetentionRunbook.includes("## Alert response") ||
  !ttlRetentionRunbook.includes("expiresAt <= now")
)
  throw new Error("TTL retention alert or response wiring is incomplete");
if (!rules.includes(`${metric}_count`) || !rules.includes(`${metric}_bucket`)) {
  throw new Error("Alert rules do not use the emitted HTTP metric series");
}
if (!rules.includes("for: 10m") || !rules.includes("for: 5m")) {
  throw new Error("Alert rules must use sustained evaluation windows");
}
if (!Array.isArray(dashboard.panels) || dashboard.panels.length < 6) {
  throw new Error(
    "Observability dashboard must contain API and uptime service-health panels",
  );
}
for (const panel of dashboard.panels) {
  const expressions =
    panel.targets?.map((target) => target.expr).join(" ") ?? "";
  if (
    !expressions.includes(metric) &&
    !expressions.includes("probe_") &&
    !expressions.includes("amanor_protocol_desk_") &&
    !expressions.includes("amanor_room_retention_") &&
    !expressions.includes("amanor_personal_data_retention_") &&
    !expressions.includes("amanor_telemetry_export_")
  )
    throw new Error(
      `Dashboard panel ${panel.id} is not wired to emitted or black-box metrics`,
    );
}
if (
  !blackbox.includes("fail_if_not_ssl: true") ||
  !blackbox.includes("valid_status_codes: [200]")
) {
  throw new Error(
    "Black-box probes must require TLS and exact HTTP 200 responses",
  );
}
for (const service of ["amanor-web", "amanor-admin", "amanor-api"]) {
  if (!targets.includes(`service: ${service}`))
    throw new Error(`Missing independent uptime target ${service}`);
}
if (!targets.includes("/v1/health/ready"))
  throw new Error("API uptime target must exercise dependency readiness");
if (
  !scrape.includes("job_name: amanor-uptime") ||
  !scrape.includes("target_label: __param_target") ||
  !scrape.includes("replacement: blackbox-exporter:9115")
) {
  throw new Error("Prometheus uptime scrape wiring is incomplete");
}
for (const service of ["amanor-web", "amanor-admin", "amanor-api"]) {
  if (!scrape.includes(`service: ${service}`))
    throw new Error(`Scrape configuration is missing service label ${service}`);
}
if (
  !runbook.includes("## Alert drill and response") ||
  !runbook.includes("AmanorApiHighErrorRate") ||
  !runbook.includes("templates/deployed-observability-acceptance-record.md")
) {
  throw new Error(
    "Observability runbook is missing the executable alert drill",
  );
}
for (const invariant of [
  "safeRequestId",
  "safeTraceparent",
  "correlationRequestHeaders",
  "correlationResponseHeaders",
]) {
  if (!correlationHelper.includes(invariant))
    throw new Error(`Web correlation boundary lost ${invariant}`);
}
for (const invariant of ["X-Request-ID", "traceparent"]) {
  if (!adminApiClient.includes(invariant))
    throw new Error(`Admin API client lost ${invariant} propagation`);
  if (!apiRequestContext.includes(invariant))
    throw new Error(`NestJS request context lost ${invariant} handling`);
}
for (const invariant of [
  "OTLPTraceExporter",
  "BatchSpanProcessor",
  "maxQueueSize: 512",
  "maxExportBatchSize: 64",
  "exportTimeoutMillis: 3_000",
  "ATTR_HTTP_REQUEST_METHOD",
  "ATTR_HTTP_RESPONSE_STATUS_CODE",
  "ATTR_URL_PATH",
  "HealthTrackedSpanExporter",
  "amanor_telemetry_export_configured",
  "amanor_telemetry_export_healthy",
]) {
  if (!apiTelemetry.includes(invariant))
    throw new Error(`NestJS OTLP trace boundary lost ${invariant}`);
}
if (
  !rules.includes("AmanorTelemetryExportFailure") ||
  !rules.includes("amanor_telemetry_export_configured == 1") ||
  !rules.includes("amanor_telemetry_export_healthy == 0") ||
  !JSON.stringify(dashboard).includes("amanor_telemetry_export_healthy") ||
  !runbook.includes("AmanorTelemetryExportFailure")
)
  throw new Error(
    "Telemetry export health alert/dashboard/runbook is incomplete",
  );
for (const variable of [
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_TRACE_SAMPLE_RATIO",
]) {
  if (!apiEnvironment.includes(variable) || !runbook.includes(variable))
    throw new Error(
      `OTLP configuration is undocumented or unvalidated: ${variable}`,
    );
}
for (const route of correlatedWebRoutes) {
  const source = await readFile(
    `apps/web/src/app/api/${route}/route.ts`,
    "utf8",
  );
  if (
    !source.includes("requestCorrelation") ||
    !source.includes("correlationResponseHeaders")
  )
    throw new Error(`Web API route ${route} lost correlation propagation`);
}
process.stdout.write(
  "Observability correlation, dashboard, alert rules and runbook are internally consistent.\n",
);
