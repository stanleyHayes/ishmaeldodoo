import assert from "node:assert/strict";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const required = (environment, name) => {
  const value = environment[name]?.trim();
  assert.ok(value, `${name} is required`);
  return value;
};

async function checkedJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`${label} returned HTTP ${response.status}`);
  return response.json();
}

async function poll({
  read,
  ready,
  failed,
  label,
  wait,
  onState = async () => undefined,
  attempts = 90,
}) {
  let lastState = "unknown";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const value = await read();
    lastState = value.state;
    await onState(value);
    if (ready(value)) return value;
    if (failed(value)) throw new Error(`${label} failed in state ${lastState}`);
    if (attempt < attempts) await wait(10_000);
  }
  throw new Error(`${label} did not become ready; last state ${lastState}`);
}

export async function deployProviderRevision({
  environment = process.env,
  fetchImpl = fetch,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const revision = required(environment, "REQUESTED_REVISION");
  assert.match(revision, /^[0-9a-f]{40}$/u);
  const deploymentEnvironment = required(
    environment,
    "AMANOR_SMOKE_ENVIRONMENT",
  );
  const attemptPath = environment.AMANOR_DEPLOYMENT_ATTEMPT_PATH?.trim();
  const attempt = {
    schemaVersion: 1,
    sourceRevision: revision,
    environment: deploymentEnvironment,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phase: "provider-validation",
    outcome: "in_progress",
    deployments: {},
  };
  const persistAttempt = async () => {
    if (!attemptPath) return;
    attempt.updatedAt = new Date().toISOString();
    await mkdir(path.dirname(attemptPath), { recursive: true });
    const temporaryPath = `${attemptPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(attempt, null, 2)}\n`, {
      mode: 0o600,
      flag: "w",
    });
    await rename(temporaryPath, attemptPath);
  };
  await persistAttempt();

  try {
    const renderServiceId = required(environment, "RENDER_API_SERVICE_ID");
    assert.match(renderServiceId, /^srv-[A-Za-z0-9]+$/u);
    const renderHeaders = {
      Authorization: `Bearer ${required(environment, "RENDER_API_KEY")}`,
      "Content-Type": "application/json",
    };
    const renderDeployment = await checkedJson(
      fetchImpl,
      `https://api.render.com/v1/services/${renderServiceId}/deploys`,
      {
        method: "POST",
        headers: renderHeaders,
        body: JSON.stringify({
          commitId: revision,
          clearCache: "do_not_clear",
        }),
      },
      "Render exact-revision deploy",
    );
    assert.match(renderDeployment.id ?? "", /^dep-[A-Za-z0-9]+$/u);
    assert.equal(renderDeployment.commit?.id, revision);
    attempt.phase = "api";
    attempt.deployments.api = {
      serviceId: renderServiceId,
      deploymentId: renderDeployment.id,
      state: "triggered",
    };
    await persistAttempt();
    const renderReady = await poll({
      label: "Render API deployment",
      wait,
      read: async () => {
        const deployment = await checkedJson(
          fetchImpl,
          `https://api.render.com/v1/services/${renderServiceId}/deploys/${renderDeployment.id}`,
          { headers: renderHeaders },
          "Render deploy status",
        );
        assert.equal(deployment.commit?.id, revision);
        return { state: deployment.status };
      },
      ready: ({ state }) => state === "live",
      failed: ({ state }) =>
        ["build_failed", "update_failed", "canceled", "deactivated"].includes(
          state,
        ),
      onState: async ({ state }) => {
        attempt.deployments.api.state = state;
        await persistAttempt();
      },
    });
    process.stdout.write(`Render API ${renderDeployment.id} is live.\n`);

    const token = required(environment, "VERCEL_TOKEN");
    const teamId = environment.VERCEL_TEAM_ID?.trim();
    const endpoint = new URL("https://api.vercel.com/v13/deployments");
    endpoint.searchParams.set("forceNew", "1");
    if (teamId) endpoint.searchParams.set("teamId", teamId);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    async function deployVercel(project, label) {
      const deployment = await checkedJson(
        fetchImpl,
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: project,
            gitSource: {
              type: "github",
              repoId: required(environment, "VERCEL_GITHUB_REPO_ID"),
              ref: revision,
              sha: revision,
            },
            target: required(environment, "VERCEL_TARGET"),
            meta: { amanorSourceRevision: revision },
          }),
        },
        `${label} exact-revision deploy`,
      );
      assert.match(deployment.id ?? "", /^dpl_[A-Za-z0-9]+$/u);
      assert.equal(
        deployment.meta?.githubCommitSha ??
          deployment.meta?.amanorSourceRevision,
        revision,
      );
      const application = label === "Admin CMS" ? "admin" : "web";
      attempt.phase = application;
      attempt.deployments[application] = {
        project,
        deploymentId: deployment.id,
        state: "triggered",
      };
      await persistAttempt();
      const ready = await poll({
        label: `${label} deployment`,
        wait,
        read: async () => {
          const statusEndpoint = new URL(
            `https://api.vercel.com/v13/deployments/${deployment.id}`,
          );
          if (teamId) statusEndpoint.searchParams.set("teamId", teamId);
          const status = await checkedJson(
            fetchImpl,
            statusEndpoint,
            { headers },
            `${label} deploy status`,
          );
          assert.equal(
            status.meta?.githubCommitSha ?? status.meta?.amanorSourceRevision,
            revision,
          );
          return { state: status.readyState };
        },
        ready: ({ state }) => state === "READY",
        failed: ({ state }) => ["ERROR", "CANCELED"].includes(state),
        onState: async ({ state }) => {
          attempt.deployments[application].state = state;
          await persistAttempt();
        },
      });
      process.stdout.write(`${label} ${deployment.id} is ready.\n`);
      return { project, deploymentId: deployment.id, state: ready.state };
    }

    const admin = await deployVercel(
      required(environment, "VERCEL_ADMIN_PROJECT"),
      "Admin CMS",
    );
    const web = await deployVercel(
      required(environment, "VERCEL_WEB_PROJECT"),
      "Public Web",
    );
    const evidence = {
      schemaVersion: 1,
      sourceRevision: revision,
      environment: deploymentEnvironment,
      createdAt: new Date().toISOString(),
      deployments: {
        api: {
          serviceId: renderServiceId,
          deploymentId: renderDeployment.id,
          state: renderReady.state,
        },
        admin,
        web,
      },
    };
    const evidencePath = environment.AMANOR_DEPLOYMENT_EVIDENCE_PATH?.trim();
    if (evidencePath) {
      await mkdir(path.dirname(evidencePath), { recursive: true });
      await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
        mode: 0o600,
        flag: "wx",
      });
    }
    attempt.phase = "complete";
    attempt.outcome = "succeeded";
    await persistAttempt();
    return evidence;
  } catch (error) {
    attempt.outcome = "failed";
    await persistAttempt();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await deployProviderRevision();
