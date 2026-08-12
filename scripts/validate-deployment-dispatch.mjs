import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const required = (name) => {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} is required in the selected GitHub environment`);
  return value;
};

const revision = required("REQUESTED_REVISION");
assert.match(revision, /^[0-9a-f]{40}$/u, "revision must be a full commit SHA");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  revision,
  "checked-out source does not match the requested immutable revision",
);
assert.equal(required("DEPLOY_CONFIRMATION"), "DEPLOY");
const evidence = new URL(required("MIGRATION_EVIDENCE"));
assert.equal(evidence.protocol, "https:", "migration evidence must use HTTPS");
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

for (const name of [
  "RENDER_API_KEY",
  "RENDER_API_SERVICE_ID",
  "VERCEL_TOKEN",
  "VERCEL_GITHUB_REPO_ID",
  "VERCEL_ADMIN_PROJECT",
  "VERCEL_WEB_PROJECT",
  "VERCEL_TARGET",
])
  required(name);
assert.equal(
  required("VERCEL_TARGET"),
  required("AMANOR_SMOKE_ENVIRONMENT"),
  "Vercel target must match the selected GitHub deployment environment",
);
for (const name of [
  "AMANOR_SMOKE_API_URL",
  "AMANOR_SMOKE_ADMIN_URL",
  "AMANOR_SMOKE_WEB_URL",
]) {
  const url = new URL(required(name));
  assert.equal(url.protocol, "https:", `${name} must use HTTPS`);
  assert.equal(url.username, "", `${name} must not contain credentials`);
  assert.equal(url.password, "", `${name} must not contain credentials`);
}

process.stdout.write(`Deployment dispatch validated for ${revision}.\n`);
