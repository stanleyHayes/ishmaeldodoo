import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workflows = {
  Quality: ".github/workflows/quality.yml",
  "CodeQL SAST": ".github/workflows/codeql.yml",
};

export async function verifyHostedGates({
  environment = process.env,
  execute = execFileSync,
} = {}) {
  const revision = environment.REQUESTED_REVISION;
  const repository = environment.GH_REPOSITORY;
  assert.match(revision ?? "", /^[0-9a-f]{40}$/u);
  assert.match(repository ?? "", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);

  const response = JSON.parse(
    execute(
      "gh",
      [
        "api",
        `repos/${repository}/actions/runs?head_sha=${revision}&per_page=100`,
      ],
      { encoding: "utf8" },
    ),
  );
  assert.ok(
    Array.isArray(response.workflow_runs),
    "invalid GitHub runs response",
  );
  const gates = {};
  for (const [workflow, workflowPath] of Object.entries(workflows)) {
    const successful = response.workflow_runs
      .filter(
        (run) =>
          run.name === workflow &&
          run.path === workflowPath &&
          run.event === "push" &&
          run.head_branch === "main" &&
          run.head_sha === revision &&
          run.repository?.full_name === repository &&
          run.status === "completed" &&
          run.conclusion === "success",
      )
      .sort((left, right) => Number(right.id) - Number(left.id));
    assert.ok(
      successful.length > 0,
      `${workflow} has no successful completed run for ${revision}`,
    );
    const run = successful[0];
    assert.ok(
      Number.isSafeInteger(run.id) && run.id > 0,
      `${workflow} run ID is invalid`,
    );
    assert.ok(
      Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0,
      `${workflow} run attempt is invalid`,
    );
    assert.match(
      run.html_url ?? "",
      /^https:\/\/github\.com\//u,
      `${workflow} run URL is invalid`,
    );
    assert.equal(
      run.html_url,
      `https://github.com/${repository}/actions/runs/${run.id}`,
      `${workflow} run URL provenance`,
    );
    gates[workflow] = {
      runId: String(run.id),
      runAttempt: String(run.run_attempt),
      workflowPath,
      event: "push",
      headBranch: "main",
      url: run.html_url,
      conclusion: "success",
    };
  }

  const evidence = {
    schemaVersion: 1,
    repository,
    sourceRevision: revision,
    verifiedAt: new Date().toISOString(),
    gates,
  };
  const evidencePath = environment.AMANOR_HOSTED_GATES_EVIDENCE_PATH?.trim();
  if (evidencePath) {
    await mkdir(path.dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
  }
  return evidence;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const evidence = await verifyHostedGates();
  process.stdout.write(
    `Hosted Quality and CodeQL passed for ${evidence.sourceRevision}.\n`,
  );
}
