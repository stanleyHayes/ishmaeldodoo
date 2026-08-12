import assert from "node:assert/strict";
import test from "node:test";
import { validateDeploymentDispatch } from "./validate-deployment-dispatch.mjs";

const revision = "d".repeat(40);
const valid = {
  REQUESTED_REVISION: revision,
  DEPLOY_CONFIRMATION: "DEPLOY",
  MIGRATION_EVIDENCE: "https://evidence.example.test/migration/42",
  MIGRATION_EVIDENCE_SHA256: `sha256:${"a".repeat(64)}`,
  RENDER_API_KEY: "render-key",
  RENDER_API_SERVICE_ID: "srv-api",
  VERCEL_TOKEN: "vercel-token",
  VERCEL_GITHUB_REPO_ID: "repo-id",
  VERCEL_ADMIN_PROJECT: "admin",
  VERCEL_WEB_PROJECT: "web",
  VERCEL_TARGET: "staging",
  AMANOR_SMOKE_ENVIRONMENT: "staging",
  AMANOR_SMOKE_API_URL: "https://api.example.test",
  AMANOR_SMOKE_ADMIN_URL: "https://admin.example.test",
  AMANOR_SMOKE_WEB_URL: "https://web.example.test",
};
const execute = () => `${revision}\n`;

test("accepts an exact revision and immutable migration evidence", () => {
  const result = validateDeploymentDispatch({ environment: valid, execute });
  assert.equal(result.revision, revision);
  assert.equal(result.migrationEvidence, valid.MIGRATION_EVIDENCE);
});

test("rejects mutable, credential-bearing and malformed migration evidence", () => {
  for (const override of [
    { MIGRATION_EVIDENCE: "http://evidence.example.test/migration/42" },
    { MIGRATION_EVIDENCE: "https://user:pass@evidence.example.test/42" },
    { MIGRATION_EVIDENCE_SHA256: "a".repeat(64) },
    { MIGRATION_EVIDENCE_SHA256: `sha256:${"A".repeat(64)}` },
  ])
    assert.throws(() =>
      validateDeploymentDispatch({
        environment: { ...valid, ...override },
        execute,
      }),
    );
});
