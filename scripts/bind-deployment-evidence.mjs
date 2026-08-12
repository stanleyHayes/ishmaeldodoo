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
  const [providerBuffer, smokeBuffer] = await Promise.all([
    readFile(providerPath),
    readFile(smokePath),
  ]);
  const provider = JSON.parse(providerBuffer.toString("utf8"));
  const smoke = JSON.parse(smokeBuffer.toString("utf8"));
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
  const revision = required(environment, "REQUESTED_REVISION");
  const deploymentEnvironment = required(
    environment,
    "AMANOR_SMOKE_ENVIRONMENT",
  );
  assert.equal(provider.sourceRevision, revision);
  assert.equal(provider.environment, deploymentEnvironment);
  assert.equal(smoke.environment, deploymentEnvironment);
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

  const serialized = `${providerBuffer.toString("utf8")}\n${smokeBuffer.toString("utf8")}`;
  assert.doesNotMatch(
    serialized,
    /authorization|bearer|token|secret|password|cookie|deploy.?hook/iu,
    "deployment evidence contains a forbidden secret-like key or value",
  );
  const manifest = {
    schemaVersion: 1,
    repository: required(environment, "AMANOR_DEPLOYMENT_REPOSITORY"),
    workflowRunId: required(environment, "AMANOR_DEPLOYMENT_RUN_ID"),
    workflowRunAttempt: required(environment, "AMANOR_DEPLOYMENT_RUN_ATTEMPT"),
    environment: deploymentEnvironment,
    sourceRevision: revision,
    migrationEvidence: migrationEvidence.href,
    files: {
      "provider-deployments.json": `sha256:${digest(providerBuffer)}`,
      "smoke.json": `sha256:${digest(smokeBuffer)}`,
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
