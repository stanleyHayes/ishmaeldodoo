import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyHostedGates } from "./verify-hosted-gates.mjs";

const revision = "b".repeat(40);
const environment = (evidencePath) => ({
  REQUESTED_REVISION: revision,
  GH_REPOSITORY: "stanleyHayes/ishmaeldodoo",
  AMANOR_HOSTED_GATES_EVIDENCE_PATH: evidencePath,
});
const run = (name, id, overrides = {}) => ({
  name,
  id,
  path:
    name === "Quality"
      ? ".github/workflows/quality.yml"
      : ".github/workflows/codeql.yml",
  event: "push",
  head_branch: "main",
  head_sha: revision,
  run_attempt: 1,
  repository: { full_name: "stanleyHayes/ishmaeldodoo" },
  status: "completed",
  conclusion: "success",
  html_url: `https://github.com/stanleyHayes/ishmaeldodoo/actions/runs/${id}`,
  ...overrides,
});
const execute = (runs) => () => JSON.stringify({ workflow_runs: runs });

test("retains exact successful hosted gate run identities", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "amanor-gates-"));
  const evidencePath = path.join(directory, "hosted-gates.json");
  const evidence = await verifyHostedGates({
    environment: environment(evidencePath),
    execute: execute([
      run("Quality", 41),
      run("Quality", 42),
      run("CodeQL SAST", 43),
    ]),
  });
  assert.equal(evidence.gates.Quality.runId, "42");
  assert.equal(evidence.gates["CodeQL SAST"].runId, "43");
  assert.deepEqual(JSON.parse(await readFile(evidencePath, "utf8")), evidence);
});

test("rejects wrong revisions and unsuccessful gates", async () => {
  await assert.rejects(
    verifyHostedGates({
      environment: environment(),
      execute: execute([
        run("Quality", 41, { head_sha: "c".repeat(40) }),
        run("CodeQL SAST", 43),
      ]),
    }),
  );
  await assert.rejects(
    verifyHostedGates({
      environment: environment(),
      execute: execute([
        run("Quality", 41),
        run("CodeQL SAST", 43, { conclusion: "failure" }),
      ]),
    }),
  );
});

test("rejects pull-request, non-main and lookalike workflow provenance", async () => {
  for (const qualityOverride of [
    { event: "pull_request" },
    { head_branch: "feature" },
    { path: ".github/workflows/lookalike.yml" },
    { repository: { full_name: "attacker/ishmaeldodoo" } },
    { html_url: "https://github.com/attacker/ishmaeldodoo/actions/runs/41" },
  ])
    await assert.rejects(
      verifyHostedGates({
        environment: environment(),
        execute: execute([
          run("Quality", 41, qualityOverride),
          run("CodeQL SAST", 43),
        ]),
      }),
    );
});
