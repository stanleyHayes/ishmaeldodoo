import { readFile } from "node:fs/promises";
import { evaluateAnalyticsPanel } from "./lib/product-dashboard-qa.mjs";

const manifest = JSON.parse(
  await readFile("infra/analytics/product-dashboard.json", "utf8"),
);
const catalogue = await readFile(
  "apps/web/src/lib/analytics-catalog.ts",
  "utf8",
);
const runbook = await readFile(
  "docs/operations/product-measurement-dashboard.md",
  "utf8",
);
const framework = JSON.parse(
  await readFile("infra/analytics/outcome-framework.json", "utf8"),
);
const cadence = await readFile(
  "docs/operations/measurement-cadence.md",
  "utf8",
);
const templates = Object.fromEntries(
  await Promise.all(
    [
      "monthly-data-quality-review",
      "monthly-measurement-digest",
      "quarterly-product-review",
      "six-month-outcome-report",
    ].map(async (name) => [
      name,
      await readFile(`docs/operations/templates/${name}.md`, "utf8"),
    ]),
  ),
);

const eventBlock = catalogue.match(
  /export const analyticsEventNames = \[([\s\S]*?)\] as const;/u,
)?.[1];
const routeBlock = catalogue.match(
  /const baseRoutes = \[([\s\S]*?)\] as const;/u,
)?.[1];
if (!eventBlock || !routeBlock)
  throw new Error("Analytics catalogue cannot be inspected");
const values = (block) =>
  [...block.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
const allowedEvents = new Set(values(eventBlock));
const baseRoutes = new Set(values(routeBlock));
const allowedDimensions = new Set(["route", "locale", "audience", "mode"]);
const allowedAnalyticsMeasures = new Set([
  "count",
  "count_by_event",
  "completed_divided_by_started",
  "activation_count_and_sahel_share",
]);
const requiredOutcomes = new Set([
  "reach",
  "desk_funnel",
  "desk_sla",
  "press_kit",
  "atlas",
  "signals",
  "office_hours",
  "sahel_mode",
]);

if (manifest.schemaVersion !== 1 || manifest.privacy?.minimumGroupSize < 10)
  throw new Error("Dashboard privacy schema or threshold is invalid");
if (manifest.privacy?.forbidRawEventExport !== true)
  throw new Error("Raw product-event export must remain disabled");
if (
  JSON.stringify(manifest.privacy?.allowedDimensions) !==
  JSON.stringify([...allowedDimensions])
)
  throw new Error("Dashboard privacy dimensions have drifted");
if (!Array.isArray(manifest.panels))
  throw new Error("Dashboard panels are missing");

const panelIds = new Set();
for (const panel of manifest.panels) {
  if (!requiredOutcomes.delete(panel.outcome))
    throw new Error(
      `Unexpected or duplicate dashboard outcome ${panel.outcome}`,
    );
  if (!panel.id || panelIds.has(panel.id))
    throw new Error(`Missing or duplicate dashboard panel id ${panel.id}`);
  panelIds.add(panel.id);
  if (
    (panel.groupBy ?? []).some((dimension) => !allowedDimensions.has(dimension))
  )
    throw new Error(`Panel ${panel.id} uses a disallowed dimension`);
  if (panel.source === "analytics") {
    if (!allowedAnalyticsMeasures.has(panel.measure))
      throw new Error(`Panel ${panel.id} uses an unsupported measure`);
    if (
      !panel.events?.length ||
      panel.events.some((event) => !allowedEvents.has(event))
    )
      throw new Error(`Panel ${panel.id} uses an unapproved analytics event`);
    if (panel.minimumGroupSize < manifest.privacy.minimumGroupSize)
      throw new Error(`Panel ${panel.id} weakens the aggregation threshold`);
    for (const route of panel.routeFilter ?? []) {
      const base = route.startsWith("/fr/") ? route.slice(3) : route;
      if (!baseRoutes.has(base))
        throw new Error(`Panel ${panel.id} uses an unapproved route ${route}`);
    }
  } else if (
    panel.source !== "prometheus" ||
    panel.series !== "amanor_protocol_desk_open_escalations"
  ) {
    throw new Error(`Panel ${panel.id} uses an unapproved data source`);
  }
}
if (requiredOutcomes.size)
  throw new Error(
    `Dashboard misses outcomes: ${[...requiredOutcomes].join(", ")}`,
  );

const analyticsPanels = Object.fromEntries(
  manifest.panels
    .filter(({ source }) => source === "analytics")
    .map((panel) => [panel.id, panel]),
);
const syntheticEvents = [
  ...Array.from({ length: 10 }, () => ({
    name: "pageview",
    route: "/record",
    locale: "en-GB",
    mode: "standard",
  })),
  ...Array.from({ length: 9 }, () => ({
    name: "pageview",
    route: "/fr/signals",
    locale: "fr-FR",
    mode: "standard",
  })),
  ...Array.from({ length: 10 }, () => ({
    name: "protocol_desk_started",
    route: "/speaking/request",
    locale: "en-GB",
    mode: "sahel",
  })),
  ...Array.from({ length: 10 }, () => ({
    name: "protocol_desk_completed",
    route: "/speaking/request",
    locale: "en-GB",
    mode: "sahel",
  })),
  ...Array.from({ length: 10 }, () => ({
    name: "sahel_mode_enabled",
    route: "/record",
    locale: "fr-FR",
    mode: "sahel",
  })),
  ...Array.from({ length: 6 }, () => ({
    name: "pageview",
    route: "/record",
    locale: "fr-FR",
    mode: "sahel",
  })),
  ...Array.from({ length: 4 }, () => ({
    name: "pageview",
    route: "/record",
    locale: "fr-FR",
    mode: "standard",
  })),
];

const reach = evaluateAnalyticsPanel(analyticsPanels.reach, syntheticEvents);
const englishReach = reach.find(({ key }) => key === "en-GB|/record");
if (englishReach?.suppressed || englishReach?.value !== 10)
  throw new Error("Synthetic reach count/grouping QA failed");

const signals = evaluateAnalyticsPanel(
  analyticsPanels.signals,
  syntheticEvents,
);
if (signals.length !== 1 || signals[0]?.suppressed !== true)
  throw new Error("Synthetic nine-event privacy suppression QA failed");
signals.push(
  ...evaluateAnalyticsPanel(analyticsPanels.signals, [
    ...syntheticEvents,
    {
      name: "pageview",
      route: "/fr/signals",
      locale: "fr-FR",
      mode: "standard",
    },
  ]),
);
if (signals.at(-1)?.suppressed || signals.at(-1)?.value !== 10)
  throw new Error("Synthetic ten-event privacy threshold QA failed");

const funnel = evaluateAnalyticsPanel(
  analyticsPanels["desk-funnel"],
  syntheticEvents,
);
if (funnel.length !== 1 || funnel[0]?.value !== 1)
  throw new Error("Synthetic Desk funnel arithmetic QA failed");

const sahel = evaluateAnalyticsPanel(
  analyticsPanels["sahel-mode"],
  syntheticEvents.filter(
    ({ locale, route }) => locale === "fr-FR" && route === "/record",
  ),
).find(({ key }) => key === "fr-FR");
if (sahel?.value?.activations !== 10 || sahel?.value?.sahelShare !== 0.6)
  throw new Error("Synthetic Sahel share arithmetic QA failed");

const forbiddenKeys = [
  "email",
  "name",
  "organisation",
  "reference",
  "requestId",
  "recordId",
  "ip",
  "userAgent",
  "referrer",
  "content",
];
const queryShape = JSON.stringify(
  manifest.panels.map(({ events, groupBy, routeFilter, series }) => ({
    events,
    groupBy,
    routeFilter,
    series,
  })),
);
for (const key of forbiddenKeys)
  if (queryShape.toLowerCase().includes(key.toLowerCase()))
    throw new Error(`Dashboard query shape contains forbidden data key ${key}`);

for (const heading of [
  "## Deployment procedure",
  "## Event QA",
  "## Screenshot evidence",
  "## Data-quality review",
])
  if (!runbook.includes(heading))
    throw new Error(`Runbook is missing ${heading}`);

const requiredOutcomeIds = [
  "canonical_source",
  "canonical_title",
  "managed_speaking_requests",
  "partner_self_service",
  "atlas_legibility",
  "youth_conversion",
  "bilingual_reach",
  "confidential_trust",
];
if (
  framework.schemaVersion !== 1 ||
  framework.baseline !== "production_launch" ||
  framework.reportingTimezone !== "Africa/Accra" ||
  JSON.stringify(framework.outcomes.map(({ id }) => id)) !==
    JSON.stringify(requiredOutcomeIds)
)
  throw new Error("Six-month outcome framework has drifted from the brief");
const targetEvidence = JSON.stringify(
  framework.outcomes.map(({ target }) => target),
);
for (const value of [60, 75, 40, 90, 300, 150, 12, 10, 0])
  if (!targetEvidence.includes(`\"value\":${value}`))
    throw new Error(`Outcome framework is missing brief target ${value}`);
if (
  JSON.stringify(framework.cadence?.monthlyDigest?.questionIds) !==
  JSON.stringify(["record_reach", "desk_health", "youth_pipeline"])
)
  throw new Error(
    "Monthly digest must answer exactly the brief's three questions",
  );
for (const phrase of [
  "Production launch is day zero",
  "Observed",
  "Suppressed",
  "Unavailable",
  "Not launched",
  "Never estimate missing events",
])
  if (!cadence.includes(phrase))
    throw new Error(`Measurement cadence is missing ${phrase}`);
for (const heading of [
  "## Is the record reaching the right people?",
  "## Is the Desk working?",
  "## Is the youth pipeline alive?",
])
  if (!templates["monthly-measurement-digest"].includes(heading))
    throw new Error(`Monthly digest is missing ${heading}`);
for (const outcomeId of requiredOutcomeIds)
  if (!templates["six-month-outcome-report"].includes(`\`${outcomeId}\``))
    throw new Error(`Six-month report is missing ${outcomeId}`);
for (const [name, template] of Object.entries(templates))
  if (!template.includes("Not run") && !template.includes("Not launched"))
    throw new Error(`${name} must default to an honest unexecuted state`);

process.stdout.write(
  `Product dashboard covers ${manifest.panels.length} outcomes using ${allowedEvents.size} approved events with group suppression at ${manifest.privacy.minimumGroupSize}; cadence preserves ${requiredOutcomeIds.length} month-six targets.\n`,
);
