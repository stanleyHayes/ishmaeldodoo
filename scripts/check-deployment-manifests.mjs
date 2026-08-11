import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const names = ["web", "admin", "api"];
const environment = JSON.parse(
  await readFile("infra/deployment/environment-contract.json", "utf8"),
);
const inventory = JSON.parse(
  await readFile("infra/deployment/secret-inventory.json", "utf8"),
);
const frontendVerifier = await readFile(
  "scripts/verify-frontend-containers.mjs",
  "utf8",
);
const apiVerifier = await readFile("scripts/verify-api-container.mjs", "utf8");
const manifests = new Map(
  await Promise.all(
    names.map(async (name) => [
      name,
      JSON.parse(
        await readFile(`infra/deployment/manifests/${name}.json`, "utf8"),
      ),
    ]),
  ),
);

assert.deepEqual(environment.deployables, names);
assert.equal(
  new Set([...manifests.values()].map((item) => item.releaseUnit)).size,
  3,
);
assert.equal(
  new Set([...manifests.values()].map((item) => item.container.port)).size,
  3,
);

const digestPattern =
  /^registry\.example\.invalid\/amanor-(?:web|admin|api)@sha256:[0-9a-f]{64}$/u;
const sort = (values) => [...values].sort();

for (const name of names) {
  const manifest = manifests.get(name);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.name, name);
  assert.match(
    manifest.image,
    digestPattern,
    `${name} image must use a digest`,
  );
  assert.equal(manifest.container.runAsUser, 1000);
  assert.equal(manifest.container.readOnlyRootFilesystem, true);
  assert.ok(manifest.container.writableTmpfs.includes("/tmp"));
  assert.ok(
    manifest.container.writableTmpfs.every((path) => path.startsWith("/")),
  );
  assert.equal(manifest.rollback.independent, true);
  assert.equal(manifest.rollback.strategy, "prior-image-digest");
  for (const probe of [manifest.health.liveness, manifest.health.readiness]) {
    assert.match(probe.path, /^\//u);
    assert.ok(probe.initialDelaySeconds >= 0);
    assert.ok(probe.periodSeconds >= 5);
  }
  assert.deepEqual(
    sort(manifest.publicBuildVariables),
    sort(inventory.deployables[name].publicBuildVariables),
    `${name} public build variables drifted from custody inventory`,
  );
  const jobClasses = manifest.jobs.flatMap((job) => job.secretClasses);
  assert.deepEqual(
    sort([...manifest.secretClasses, ...jobClasses]),
    sort(environment.requiredSecretClasses[name]),
    `${name} secret classes drifted from the environment contract`,
  );
  assert.equal(
    new Set([...manifest.secretClasses, ...jobClasses]).size,
    manifest.secretClasses.length + jobClasses.length,
    `${name} assigns one secret class to multiple phases`,
  );
}

const admin = manifests.get("admin");
assert.deepEqual(admin.secretClasses, [], "Admin may not receive secrets");
assert.deepEqual(admin.jobs, [], "Admin may not run privileged jobs");

const api = manifests.get("api");
assert.equal(api.health.liveness.path, "/v1/health/live");
assert.equal(api.health.readiness.path, "/v1/health/ready");
assert.ok(api.container.terminationGracePeriodSeconds >= 10);
assert.deepEqual(
  api.jobs.map((job) => job.name),
  ["migration", "retention"],
);
for (const job of api.jobs) {
  assert.equal(job.concurrency, "forbid");
  assert.ok(!job.command.join(" ").includes("sh -c"));
}
assert.ok(!api.secretClasses.includes("mongodb_migration"));
assert.ok(!api.secretClasses.includes("mongodb_retention"));
for (const [name, verifier] of [
  ["frontend", frontendVerifier],
  ["api", apiVerifier],
]) {
  assert.ok(
    verifier.includes('"--read-only"'),
    `${name} verifier lost read-only runtime`,
  );
  assert.ok(
    verifier.includes('"--tmpfs"'),
    `${name} verifier lost bounded writable tmpfs`,
  );
}

process.stdout.write(
  "Three independent digest-pinned deployment manifests match environment and secret custody contracts.\n",
);
