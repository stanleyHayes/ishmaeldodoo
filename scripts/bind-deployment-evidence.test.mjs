import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bindDeploymentEvidence } from "./bind-deployment-evidence.mjs";

const revision = "a".repeat(40);
const provider = {
  schemaVersion: 1,
  sourceRevision: revision,
  environment: "staging",
  createdAt: "2026-08-12T00:00:00.000Z",
  deployments: {
    api: { serviceId: "srv-api", deploymentId: "dep-api", state: "live" },
    admin: { project: "admin", deploymentId: "dpl_admin", state: "READY" },
    web: { project: "web", deploymentId: "dpl_web", state: "READY" },
  },
};
const smoke = {
  schemaVersion: 1,
  environment: "staging",
  checkedAt: "2026-08-12T00:01:00.000Z",
  origins: {
    web: "https://web.example.test",
    admin: "https://admin.example.test",
    api: "https://api.example.test",
  },
  checks: {
    independentOrigins: "passed",
    protectedNonProduction: "passed",
    publicEnglishFrenchAtlas: "passed",
    indexingPolicy: "passed",
    frontendSecurityHeaders: "passed",
    adminNoStoreNoindex: "passed",
    apiLiveReadyCorrelation: "passed",
  },
};
const hostedGates = {
  schemaVersion: 1,
  repository: "stanleyHayes/ishmaeldodoo",
  sourceRevision: revision,
  verifiedAt: "2026-08-12T00:00:30.000Z",
  gates: {
    Quality: {
      runId: "41",
      runAttempt: "1",
      workflowPath: ".github/workflows/quality.yml",
      event: "push",
      headBranch: "main",
      url: "https://github.com/stanleyHayes/ishmaeldodoo/actions/runs/41",
      conclusion: "success",
    },
    "CodeQL SAST": {
      runId: "42",
      runAttempt: "1",
      workflowPath: ".github/workflows/codeql.yml",
      event: "push",
      headBranch: "main",
      url: "https://github.com/stanleyHayes/ishmaeldodoo/actions/runs/42",
      conclusion: "success",
    },
  },
};
const environment = (directory) => ({
  AMANOR_DEPLOYMENT_EVIDENCE_DIR: directory,
  REQUESTED_REVISION: revision,
  AMANOR_SMOKE_ENVIRONMENT: "staging",
  AMANOR_DEPLOYMENT_REPOSITORY: "stanleyHayes/ishmaeldodoo",
  AMANOR_DEPLOYMENT_RUN_ID: "123",
  AMANOR_DEPLOYMENT_RUN_ATTEMPT: "1",
  AMANOR_MIGRATION_EVIDENCE: "https://evidence.example.test/migration/123",
});
async function fixture(providerValue = provider, smokeValue = smoke) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "amanor-deploy-"));
  await Promise.all([
    writeFile(
      path.join(directory, "provider-deployments.json"),
      JSON.stringify(providerValue),
    ),
    writeFile(path.join(directory, "smoke.json"), JSON.stringify(smokeValue)),
    writeFile(
      path.join(directory, "hosted-gates.json"),
      JSON.stringify(hostedGates),
    ),
  ]);
  return directory;
}

test("binds exact provider and smoke evidence with checksums", async () => {
  const directory = await fixture();
  const manifest = await bindDeploymentEvidence(environment(directory));
  assert.equal(manifest.sourceRevision, revision);
  assert.match(
    manifest.files["provider-deployments.json"],
    /^sha256:[a-f0-9]{64}$/u,
  );
  assert.match(manifest.files["hosted-gates.json"], /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")),
    manifest,
  );
});

test("rejects environment mismatch and secret-like evidence", async () => {
  await assert.rejects(
    bindDeploymentEvidence(
      environment(await fixture({ ...provider, environment: "preview" })),
    ),
  );
  await assert.rejects(
    bindDeploymentEvidence(
      environment(await fixture({ ...provider, secret: "must-not-escape" })),
    ),
  );
});
