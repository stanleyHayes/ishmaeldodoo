import { readFile } from "node:fs/promises";
import { runDeploymentSmoke } from "./smoke-deployment.mjs";
import { runRollbackRehearsal } from "./rollback-rehearsal.mjs";

const contract = JSON.parse(
  await readFile("infra/deployment/environment-contract.json", "utf8"),
);
const runbook = await readFile(
  "docs/operations/staging-release-candidate.md",
  "utf8",
);
const record = await readFile(
  "docs/operations/templates/release-candidate-record.md",
  "utf8",
);
const rollbackPlan = JSON.parse(
  await readFile("infra/deployment/rollback-plan.example.json", "utf8"),
);

if (
  contract.schemaVersion !== 1 ||
  JSON.stringify(contract.deployables) !==
    JSON.stringify(["web", "admin", "api"])
)
  throw new Error(
    "Deployment contract must preserve three independent deployables",
  );
for (const name of ["local", "preview", "staging", "production"]) {
  const environment = contract.environments?.[name];
  if (!environment?.isolatedData)
    throw new Error(`${name} must use isolated data and credentials`);
  if (name !== "local" && !environment.httpsRequired)
    throw new Error(`${name} must require HTTPS`);
}
for (const name of ["preview", "staging"])
  if (
    !contract.environments[name].edgeProtectionRequired ||
    contract.environments[name].publicIndexing
  )
    throw new Error(`${name} must be protected and noindex`);
for (const rule of [
  "distinctOrigins",
  "immutableRevision",
  "databaseMigrationSeparateJob",
  "contentDeployIndependent",
  "independentRollback",
  "timedRollbackEvidence",
  "oneApprovingReview",
  "greenPipeline",
])
  if (contract.releaseRules?.[rule] !== true)
    throw new Error(`Release contract is missing ${rule}`);
for (const secretClass of [
  "mongodb_application",
  "mongodb_migration",
  "mongodb_retention",
  "mongodb_room",
])
  if (!contract.requiredSecretClasses?.api?.includes(secretClass))
    throw new Error(`API deployment is missing ${secretClass} custody`);

const requiredSections = [
  "## Candidate entry criteria",
  "## Deployment order",
  "## Smoke and evidence",
  "## Independent rollback",
  "## Promotion decision",
];
for (const heading of requiredSections)
  if (!runbook.includes(heading))
    throw new Error(`Release runbook misses ${heading}`);
for (const field of [
  "Source revision",
  "Web release",
  "Admin release",
  "API release",
  "Migration",
  "Smoke evidence",
  "Rollback",
  "Decision",
])
  if (!record.includes(field))
    throw new Error(`Release record misses ${field}`);
if (!record.includes("Not run") || !record.includes("Not approved"))
  throw new Error("Release record must default to an unexecuted state");

const baseHeaders = {
  "content-security-policy": "default-src 'self'",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=()",
};
const mockFetch = async (url, options = {}) => {
  const parsed = new URL(url);
  if (!options.headers?.Authorization)
    return new Response("edge authentication required", { status: 401 });
  if (parsed.port === "4102")
    return new Response('<meta name="robots" content="noindex">', {
      headers: { ...baseHeaders, "cache-control": "private, no-store" },
    });
  if (parsed.port === "4103")
    return new Response(
      JSON.stringify({ status: "ok", service: "amanor-api" }),
      {
        headers: {
          "content-type": "application/json",
          "x-request-id": "smoke-fixture-request",
        },
      },
    );
  if (parsed.pathname === "/robots.txt")
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: baseHeaders,
    });
  return new Response("ok", { headers: baseHeaders });
};
const smoke = await runDeploymentSmoke(
  {
    environment: "staging",
    webUrl: "http://127.0.0.1:4101",
    adminUrl: "http://127.0.0.1:4102",
    apiUrl: "http://127.0.0.1:4103",
    edgeAuthorization: "Basic smoke-fixture",
    allowHttp: true,
  },
  mockFetch,
);
if (Object.values(smoke.checks).some((status) => status !== "passed"))
  throw new Error("Deployment smoke fixture did not pass");

let fixtureTime = 0;
const executed = [];
const releaseByService = Object.fromEntries(
  rollbackPlan.deployables.map((entry) => [entry.name, entry.rollbackTarget]),
);
const rollback = await runRollbackRehearsal(rollbackPlan, {
  edgeAuthorization: "Basic fixture",
  clock: () => fixtureTime,
  checkedAt: () => "2026-08-10T00:00:00.000Z",
  execute: async (argv, label) => {
    fixtureTime += 100;
    executed.push(label);
    const service = rollbackPlan.deployables.find((entry) =>
      argv.includes(
        entry.name === "web" ? "amanor-web" : `amanor-${entry.name}`,
      ),
    );
    return label.includes("release verification")
      ? releaseByService[service?.name]
      : "ok";
  },
  smoke: async () => {
    fixtureTime += 100;
    return { checks: smoke.checks };
  },
});
if (
  rollback.status !== "passed" ||
  rollback.results.length !== 3 ||
  rollback.durationMilliseconds !== 1_100 ||
  executed.at(0) !== "API dependent-job pause" ||
  !executed.includes("API dependent-job resume")
)
  throw new Error("Rollback rehearsal fixture did not preserve safe ordering");

let resumedAfterFailure = false;
await runRollbackRehearsal(rollbackPlan, {
  edgeAuthorization: "Basic fixture",
  clock: () => 0,
  execute: async (_argv, label) => {
    if (label === "API dependent-job resume") resumedAfterFailure = true;
    return label === "api release verification" ? "wrong-release" : "ok";
  },
  smoke: async () => ({ checks: smoke.checks }),
}).then(
  () => {
    throw new Error("Mismatched provider state must fail rollback rehearsal");
  },
  () => undefined,
);
if (!resumedAfterFailure)
  throw new Error(
    "API jobs were not resumed after rollback verification failure",
  );

process.stdout.write(
  `Release process preserves ${contract.deployables.length} deployables across ${Object.keys(contract.environments).length} isolated environments; smoke fixture passed ${Object.keys(smoke.checks).length} checks and rollback fixture passed ${rollback.results.length} independent paths.\n`,
);
