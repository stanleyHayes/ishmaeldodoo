import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workflows = ["Quality", "CodeQL SAST"];

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
  for (const workflow of workflows) {
    const successful = response.workflow_runs
      .filter(
        (run) =>
          run.name === workflow &&
          run.head_sha === revision &&
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
    assert.match(
      run.html_url ?? "",
      /^https:\/\/github\.com\//u,
      `${workflow} run URL is invalid`,
    );
    gates[workflow] = {
      runId: String(run.id),
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
