import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const required = (environment, name) => {
  const value = environment[name]?.trim();
  assert.ok(value, `${name} is required`);
  return value;
};
const exactKeys = (value, keys, label) =>
  assert.deepEqual(
    Object.keys(value).sort(),
    [...keys].sort(),
    `${label} keys`,
  );
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const expectedChecks = [
  "independentOrigins",
  "protectedNonProduction",
  "publicEnglishFrenchAtlas",
  "indexingPolicy",
  "frontendSecurityHeaders",
  "adminNoStoreNoindex",
  "apiLiveReadyCorrelation",
];

export async function bindDeploymentEvidence(environment = process.env) {
  const directory = required(environment, "AMANOR_DEPLOYMENT_EVIDENCE_DIR");
  const providerPath = path.join(directory, "provider-deployments.json");
  const smokePath = path.join(directory, "smoke.json");
  const hostedGatesPath = path.join(directory, "hosted-gates.json");
  const [providerBuffer, smokeBuffer, hostedGatesBuffer] = await Promise.all([
    readFile(providerPath),
    readFile(smokePath),
    readFile(hostedGatesPath),
  ]);
  const provider = JSON.parse(providerBuffer.toString("utf8"));
  const smoke = JSON.parse(smokeBuffer.toString("utf8"));
  const hostedGates = JSON.parse(hostedGatesBuffer.toString("utf8"));
  exactKeys(
    provider,
    [
      "schemaVersion",
      "sourceRevision",
      "environment",
      "createdAt",
      "deployments",
    ],
    "provider evidence",
  );
  exactKeys(
    provider.deployments,
    ["api", "admin", "web"],
    "provider deployments",
  );
  exactKeys(
    provider.deployments.api,
    ["serviceId", "deploymentId", "state"],
    "API deployment",
  );
  for (const application of ["admin", "web"])
    exactKeys(
      provider.deployments[application],
      ["project", "deploymentId", "state"],
      `${application} deployment`,
    );
  exactKeys(
    smoke,
    ["schemaVersion", "environment", "checkedAt", "origins", "checks"],
    "smoke evidence",
  );
  exactKeys(
    hostedGates,
    ["schemaVersion", "repository", "sourceRevision", "verifiedAt", "gates"],
    "hosted gates evidence",
  );
  exactKeys(hostedGates.gates, ["Quality", "CodeQL SAST"], "hosted gates");
  for (const workflow of ["Quality", "CodeQL SAST"])
    exactKeys(
      hostedGates.gates[workflow],
      [
        "runId",
        "runAttempt",
        "workflowPath",
        "event",
        "headBranch",
        "url",
        "conclusion",
      ],
      `${workflow} gate`,
    );
  const revision = required(environment, "REQUESTED_REVISION");
  const deploymentEnvironment = required(
    environment,
    "AMANOR_SMOKE_ENVIRONMENT",
  );
  assert.equal(provider.sourceRevision, revision);
  assert.equal(provider.environment, deploymentEnvironment);
  assert.equal(smoke.environment, deploymentEnvironment);
  assert.equal(hostedGates.sourceRevision, revision);
  assert.equal(
    hostedGates.repository,
    required(environment, "AMANOR_DEPLOYMENT_REPOSITORY"),
  );
  for (const workflow of ["Quality", "CodeQL SAST"]) {
    const expectedPath =
      workflow === "Quality"
        ? ".github/workflows/quality.yml"
        : ".github/workflows/codeql.yml";
    assert.equal(hostedGates.gates[workflow].conclusion, "success");
    assert.match(hostedGates.gates[workflow].runId, /^[1-9][0-9]*$/u);
    assert.match(hostedGates.gates[workflow].runAttempt, /^[1-9][0-9]*$/u);
    assert.equal(hostedGates.gates[workflow].workflowPath, expectedPath);
    assert.equal(hostedGates.gates[workflow].event, "push");
    assert.equal(hostedGates.gates[workflow].headBranch, "main");
    assert.equal(
      hostedGates.gates[workflow].url,
      `https://github.com/${hostedGates.repository}/actions/runs/${hostedGates.gates[workflow].runId}`,
    );
  }
  exactKeys(smoke.origins, ["api", "admin", "web"], "smoke origins");
  exactKeys(smoke.checks, expectedChecks, "smoke checks");
  assert.deepEqual(Object.values(smoke.checks), Array(7).fill("passed"));
  assert.equal(new Set(Object.values(smoke.origins)).size, 3);

  const migrationEvidence = new URL(
    required(environment, "AMANOR_MIGRATION_EVIDENCE"),
  );
  assert.equal(migrationEvidence.protocol, "https:");
  assert.equal(migrationEvidence.username, "");
  assert.equal(migrationEvidence.password, "");
  const migrationEvidenceSha256 = required(
    environment,
    "AMANOR_MIGRATION_EVIDENCE_SHA256",
  );
  assert.match(migrationEvidenceSha256, /^sha256:[0-9a-f]{64}$/u);

  const serialized = `${providerBuffer.toString("utf8")}\n${smokeBuffer.toString("utf8")}\n${hostedGatesBuffer.toString("utf8")}`;
  assert.doesNotMatch(
    serialized,
    /authorization|bearer|token|secret|password|cookie|deploy.?hook/iu,
    "deployment evidence contains a forbidden secret-like key or value",
  );
  const manifest = {
    schemaVersion: 1,
    repository: hostedGates.repository,
    workflowRunId: required(environment, "AMANOR_DEPLOYMENT_RUN_ID"),
    workflowRunAttempt: required(environment, "AMANOR_DEPLOYMENT_RUN_ATTEMPT"),
    environment: deploymentEnvironment,
    sourceRevision: revision,
    migrationEvidence: migrationEvidence.href,
    migrationEvidenceSha256,
    files: {
      "provider-deployments.json": `sha256:${digest(providerBuffer)}`,
      "smoke.json": `sha256:${digest(smokeBuffer)}`,
      "hosted-gates.json": `sha256:${digest(hostedGatesBuffer)}`,
    },
  };
  await writeFile(
    path.join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600, flag: "wx" },
  );
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await bindDeploymentEvidence();
