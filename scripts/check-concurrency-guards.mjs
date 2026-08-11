import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  acquireAdvisoryLock,
  AdvisoryLockError,
} from "./lib/advisory-lock.mjs";

const root = resolve(import.meta.dirname, "..");
const lockPath = resolve(root, "tmp/coverage-admin.lock");
const packages = ["admin", "api", "web"];

for (const app of packages) {
  const manifest = JSON.parse(
    readFileSync(resolve(root, `apps/${app}/package.json`), "utf8"),
  );
  if (
    manifest.scripts["test:coverage"] !== "node ../../scripts/run-coverage.mjs"
  )
    throw new Error(`${app} coverage does not use the guarded runner`);
}

rmSync(lockPath, { force: true });
const release = acquireAdvisoryLock({
  lockPath,
  label: "concurrency guard verifier",
  resource: "@amanor/admin coverage evidence",
});
try {
  const collision = spawnSync(
    process.execPath,
    [resolve(root, "scripts/run-coverage.mjs")],
    { cwd: resolve(root, "apps/admin"), encoding: "utf8" },
  );
  if (
    collision.status === 0 ||
    !/in use by concurrency guard verifier/u.test(collision.stderr)
  )
    throw new Error(
      "Concurrent coverage execution was not refused by holder name",
    );
} finally {
  release();
}

writeFileSync(
  lockPath,
  JSON.stringify({
    pid: 2_147_483_647,
    label: "terminated coverage process",
    token: "stale",
  }),
  { mode: 0o600 },
);
const releaseRecovered = acquireAdvisoryLock({
  lockPath,
  label: "stale recovery verifier",
  resource: "@amanor/admin coverage evidence",
});
try {
  try {
    acquireAdvisoryLock({
      lockPath,
      label: "duplicate same-process verifier",
      resource: "@amanor/admin coverage evidence",
    });
    throw new Error("Same-process duplicate holder was accepted");
  } catch (error) {
    if (!(error instanceof AdvisoryLockError)) throw error;
  }
} finally {
  releaseRecovered();
}

process.stdout.write(
  "Coverage guards atomically refuse live collisions and reclaim stale holders.\n",
);
