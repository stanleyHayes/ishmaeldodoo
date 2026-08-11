import { existsSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { acquireFixtureLock, releaseFixtureLock } from "./lib/fixture-lock.mjs";

const compose = [
  "compose",
  "-p",
  "infra",
  "-f",
  "infra/docker-compose.test.yml",
];
const ignoredEnvironment = "apps/api/.env";
const isolatedEnvironment = `apps/api/.env.codex-isolated-${process.pid}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 180_000,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  return result;
}

acquireFixtureLock("the API authenticated-replica integration suite");
const hadIgnoredEnvironment = existsSync(ignoredEnvironment);
if (hadIgnoredEnvironment) renameSync(ignoredEnvironment, isolatedEnvironment);
try {
  run("docker", [...compose, "down"], { stdio: "ignore" });
  run("docker", [...compose, "up", "-d", "--wait"], { stdio: "inherit" });
  run("npm", ["run", "test:integration", "--workspace", "@amanor/api"], {
    stdio: "inherit",
    env: {
      ...process.env,
      MONGODB_TEST_URI:
        "mongodb://amanor_test_admin:amanor_test_admin_password@127.0.0.1:27028",
    },
  });
  if (process.env.UPDATE_OPENAPI_ARTIFACT === "true")
    run("node", ["scripts/generate-api-types.mjs", "generate"], {
      stdio: "inherit",
    });
} finally {
  spawnSync("docker", [...compose, "down", "--volumes"], {
    cwd: process.cwd(),
    stdio: "ignore",
    timeout: 120_000,
  });
  if (hadIgnoredEnvironment && existsSync(isolatedEnvironment))
    renameSync(isolatedEnvironment, ignoredEnvironment);
  releaseFixtureLock();
}
