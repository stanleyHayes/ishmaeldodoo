import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const revision = process.env.REQUESTED_REVISION;
const repository = process.env.GH_REPOSITORY;
assert.match(revision ?? "", /^[0-9a-f]{40}$/u);
assert.match(repository ?? "", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);

const response = JSON.parse(
  execFileSync(
    "gh",
    [
      "api",
      `repos/${repository}/actions/runs?head_sha=${revision}&per_page=100`,
    ],
    { encoding: "utf8" },
  ),
);
for (const workflow of ["Quality", "CodeQL SAST"]) {
  const runs = response.workflow_runs.filter((run) => run.name === workflow);
  assert.ok(runs.length > 0, `${workflow} has not run for ${revision}`);
  assert.ok(
    runs.some(
      (run) => run.status === "completed" && run.conclusion === "success",
    ),
    `${workflow} has no successful completed run for ${revision}`,
  );
}
process.stdout.write(`Hosted Quality and CodeQL passed for ${revision}.\n`);
