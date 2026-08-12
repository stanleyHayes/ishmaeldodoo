import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const required = (environment, name) => {
  const value = environment[name]?.trim();
  assert.ok(value, `${name} is required in the selected GitHub environment`);
  return value;
};

export function validateDeploymentDispatch({
  environment = process.env,
  execute = execFileSync,
} = {}) {
  const revision = required(environment, "REQUESTED_REVISION");
  assert.match(
    revision,
    /^[0-9a-f]{40}$/u,
    "revision must be a full commit SHA",
  );
  assert.equal(
    execute("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    revision,
    "checked-out source does not match the requested immutable revision",
  );
  assert.equal(required(environment, "DEPLOY_CONFIRMATION"), "DEPLOY");
  const evidence = new URL(required(environment, "MIGRATION_EVIDENCE"));
  assert.equal(
    evidence.protocol,
    "https:",
    "migration evidence must use HTTPS",
  );
  assert.equal(
    evidence.username,
    "",
    "migration evidence must not contain credentials",
  );
  assert.equal(
    evidence.password,
    "",
    "migration evidence must not contain credentials",
  );
  assert.match(
    required(environment, "MIGRATION_EVIDENCE_SHA256"),
    /^sha256:[0-9a-f]{64}$/u,
    "migration evidence digest must be lowercase sha256:<64 hex>",
  );

  for (const name of [
    "RENDER_API_KEY",
    "RENDER_API_SERVICE_ID",
    "VERCEL_TOKEN",
    "VERCEL_GITHUB_REPO_ID",
    "VERCEL_ADMIN_PROJECT",
    "VERCEL_WEB_PROJECT",
    "VERCEL_TARGET",
  ])
    required(environment, name);
  assert.equal(
    required(environment, "VERCEL_TARGET"),
    required(environment, "AMANOR_SMOKE_ENVIRONMENT"),
    "Vercel target must match the selected GitHub deployment environment",
  );
  for (const name of [
    "AMANOR_SMOKE_API_URL",
    "AMANOR_SMOKE_ADMIN_URL",
    "AMANOR_SMOKE_WEB_URL",
  ]) {
    const url = new URL(required(environment, name));
    assert.equal(url.protocol, "https:", `${name} must use HTTPS`);
    assert.equal(url.username, "", `${name} must not contain credentials`);
    assert.equal(url.password, "", `${name} must not contain credentials`);
  }
  return { revision, migrationEvidence: evidence.href };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = validateDeploymentDispatch();
  process.stdout.write(
    `Deployment dispatch validated for ${result.revision}.\n`,
  );
}
