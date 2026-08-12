import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  executeLoadStage,
  runLoadRehearsal,
  validateLoadPlan,
} from "./load-rehearsal.mjs";

const template = JSON.parse(
  await readFile("infra/deployment/load-plan.template.json", "utf8"),
);
const runbook = await readFile("docs/operations/load-rehearsal.md", "utf8");
const record = await readFile(
  "docs/operations/templates/load-rehearsal-record.md",
  "utf8",
);
for (const heading of [
  "## Evidence boundary",
  "## Safety preflight",
  "## Execution",
  "## Completion and cleanup",
])
  if (!runbook.includes(heading))
    throw new Error(`Load runbook misses ${heading}`);
for (const field of [
  "Baseline kind/source/observed at",
  "100x target requests per second",
  "Protocol Desk attempts/success/p95",
  "Synthetic-record cleanup evidence",
  "Operations approval/date",
  "Product approval/date",
  "Security approval/date",
])
  if (!record.includes(field)) throw new Error(`Load record misses ${field}`);
const pendingRecordSentinels = [
  "- Status: `Not run`",
  "- Environment: `Not recorded`",
  "- Staging revisions (Web/Admin/API): `Not recorded`",
  "- Baseline kind/source/observed at: `Not recorded`",
  "- Baseline requests per second: `Not recorded`",
  "- 100x target requests per second: `Not recorded`",
  "- Surge start/end: `Not recorded`",
  "- Load-plan checksum: `Not recorded`",
  "- Result checksum: `Not recorded`",
  "- Public request count/achieved rate/error rate/p95: `Not recorded`",
  "- Protocol Desk attempts/success/p95: `Not recorded`",
  "- Restricted Protocol references evidence location: `Not recorded`",
  "- Web/API/Mongo/queue/edge graphs: `Not attached`",
  "- Synthetic-record cleanup evidence: `Not recorded`",
  "- Operations approval/date: `Not approved`",
  "- Product approval/date: `Not approved`",
  "- Security approval/date: `Not approved`",
];

function validatePendingRecord(candidate) {
  for (const sentinel of pendingRecordSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Load record no longer proves the pre-execution state: ${sentinel}`,
    );
}

validatePendingRecord(record);
for (const sentinel of pendingRecordSentinels) {
  const mutated = record.replace(sentinel, "[prematurely changed]");
  assert.throws(
    () => validatePendingRecord(mutated),
    undefined,
    `Load record accepted mutation of required sentinel: ${sentinel}`,
  );
}

let templateRejected = false;
try {
  validateLoadPlan(template);
} catch (error) {
  templateRejected = /baseline/u.test(String(error));
}
if (!templateRejected)
  throw new Error(
    "The committed load template must fail until baseline evidence is supplied",
  );

const plan = {
  ...template,
  origin: "https://staging.amanor.example",
  baseline: {
    kind: "measured",
    requestsPerSecond: 2,
    sourceReference: "fixture-baseline-report",
    observedAt: "2026-08-10T00:00:00.000Z",
  },
  surge: { multiplier: 100, requestsPerSecond: 200, durationSeconds: 60 },
  protocolDesk: {
    ...template.protocolDesk,
    intervalSeconds: 30,
    cleanupOwner: "QA owner",
  },
};

const passed = await runLoadRehearsal(plan, {
  execute: async () => ({
    startedAt: "2026-08-10T01:00:00.000Z",
    finishedAt: "2026-08-10T01:01:00.000Z",
    public: { requests: 12_000, failures: 12, p95Milliseconds: 1_200 },
    protocolDesk: {
      requests: 2,
      failures: 0,
      p95Milliseconds: 1_400,
      references: ["PD-2026-9001", "PD-2026-9002"],
    },
  }),
});
if (
  passed.status !== "passed" ||
  passed.surge.requestsPerSecond !== 200 ||
  passed.public.achievedRequestsPerSecond !== 200 ||
  passed.public.errorRatePercent !== 0.1 ||
  Object.values(passed.checks).some((value) => value !== true)
)
  throw new Error("Passing load evidence was calculated incorrectly");

for (const invalid of [
  { ...plan, surge: { ...plan.surge, multiplier: 99 } },
  {
    ...plan,
    thresholds: { ...plan.thresholds, errorRatePercent: 2 },
  },
  {
    ...plan,
    traffic: [
      { method: "GET", path: "https://other.example/", weightPercent: 100 },
    ],
  },
]) {
  let rejected = false;
  try {
    validateLoadPlan(invalid);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("An unsafe load plan was accepted");
}

let thresholdFailure = false;
try {
  await runLoadRehearsal(plan, {
    execute: async () => ({
      startedAt: "2026-08-10T01:00:00.000Z",
      finishedAt: "2026-08-10T01:01:00.000Z",
      public: { requests: 12_000, failures: 0, p95Milliseconds: 1_000 },
      protocolDesk: {
        requests: 2,
        failures: 1,
        p95Milliseconds: 1_000,
        references: ["PD-2026-9001"],
      },
    }),
  });
} catch (error) {
  thresholdFailure = /threshold/u.test(String(error));
}
if (!thresholdFailure)
  throw new Error("Protocol Desk functional failure must fail the rehearsal");

let fakeTime = 0;
let publicRequests = 0;
const protocolBodies = [];
const direct = await executeLoadStage(plan, {
  authorization: "Basic fixture-only",
  now: () => (fakeTime += 1),
  sleep: async () => undefined,
  fetcher: async (url, options) => {
    if (new URL(url).pathname === "/api/protocol-desk") {
      protocolBodies.push(JSON.parse(options.body));
      return new Response(
        JSON.stringify({
          reference: `PD-2026-${String(9100 + protocolBodies.length)}`,
          state: "received",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    }
    publicRequests += 1;
    if (!options.headers.Authorization)
      throw new Error("Fixture request omitted edge authorization");
    return new Response("ok");
  },
});
if (
  publicRequests !== 12_000 ||
  direct.protocolDesk.requests !== 2 ||
  protocolBodies.some(
    (body) =>
      !body.requester.email.endsWith("@example.test") ||
      body.consent.version !== "staging-load-v1",
  )
)
  throw new Error("Direct scheduler did not preserve safe synthetic traffic");

process.stdout.write(
  `Load rehearsal enforces a dated baseline, exact 100x surge, 6 strict checks and concurrent Protocol Desk functionality; ${pendingRecordSentinels.length} pre-execution evidence mutations fail closed.\n`,
);
