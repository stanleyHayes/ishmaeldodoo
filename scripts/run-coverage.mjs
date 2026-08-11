import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  acquireAdvisoryLock,
  AdvisoryLockError,
} from "./lib/advisory-lock.mjs";

const workspace = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
).name;
if (!/^@amanor\/(?:admin|api|web)$/u.test(workspace))
  throw new Error("Coverage runner must execute from an AMANOR app workspace");

const app = workspace.slice("@amanor/".length);
const projectRoot = resolve(import.meta.dirname, "..");
const lockPath = resolve(projectRoot, `tmp/coverage-${app}.lock`);
let release;

try {
  release = acquireAdvisoryLock({
    lockPath,
    label: `${workspace} coverage`,
    resource: `${workspace} coverage evidence`,
  });
} catch (error) {
  if (!(error instanceof AdvisoryLockError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

try {
  const result = spawnSync(
    process.execPath,
    [
      resolve(projectRoot, "node_modules/vitest/vitest.mjs"),
      "run",
      "--coverage",
    ],
    { cwd: process.cwd(), env: process.env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.signal) {
    process.stderr.write(
      `Coverage worker ended with signal ${result.signal}\n`,
    );
    process.exitCode = 1;
  } else process.exitCode = result.status ?? 1;
} finally {
  release();
}
