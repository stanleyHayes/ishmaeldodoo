import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deployProviderRevision } from "./deploy-provider-revision.mjs";

const revision = "a".repeat(40);
const environment = {
  REQUESTED_REVISION: revision,
  RENDER_API_KEY: "render-token",
  RENDER_API_SERVICE_ID: "srv-amanorapi",
  VERCEL_TOKEN: "vercel-token",
  VERCEL_GITHUB_REPO_ID: "123",
  VERCEL_ADMIN_PROJECT: "amanor-admin",
  VERCEL_WEB_PROJECT: "amanor-web",
  VERCEL_TARGET: "staging",
  AMANOR_SMOKE_ENVIRONMENT: "staging",
};

const response = (value) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

test("waits for exact API, Admin and Web revisions in order", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "amanor-provider-"));
  const attemptPath = path.join(directory, "attempt.json");
  const calls = [];
  const values = [
    { id: "dep-render1", commit: { id: revision } },
    { id: "dep-render1", commit: { id: revision }, status: "live" },
    { id: "dpl_admin1", meta: { githubCommitSha: revision } },
    {
      id: "dpl_admin1",
      meta: { githubCommitSha: revision },
      readyState: "READY",
    },
    { id: "dpl_web1", meta: { githubCommitSha: revision } },
    {
      id: "dpl_web1",
      meta: { githubCommitSha: revision },
      readyState: "READY",
    },
  ];
  const evidence = await deployProviderRevision({
    environment: {
      ...environment,
      AMANOR_DEPLOYMENT_ATTEMPT_PATH: attemptPath,
    },
    wait: async () => undefined,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return response(values.shift());
    },
  });
  assert.equal(values.length, 0);
  assert.match(calls[0].url, /render\.com.*srv-amanorapi.*deploys/u);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    commitId: revision,
    clearCache: "do_not_clear",
  });
  assert.match(calls[1].url, /dep-render1/u);
  assert.equal(JSON.parse(calls[2].options.body).name, "amanor-admin");
  assert.match(calls[3].url, /dpl_admin1/u);
  assert.equal(JSON.parse(calls[4].options.body).name, "amanor-web");
  assert.match(calls[5].url, /dpl_web1/u);
  assert.deepEqual(evidence.deployments, {
    api: {
      serviceId: "srv-amanorapi",
      deploymentId: "dep-render1",
      state: "live",
    },
    admin: {
      project: "amanor-admin",
      deploymentId: "dpl_admin1",
      state: "READY",
    },
    web: {
      project: "amanor-web",
      deploymentId: "dpl_web1",
      state: "READY",
    },
  });
  const attempt = JSON.parse(await readFile(attemptPath, "utf8"));
  assert.equal(attempt.outcome, "succeeded");
  assert.equal(attempt.phase, "complete");
  assert.deepEqual(attempt.deployments, evidence.deployments);
});

test("fails before frontend deployment when Render reports a different revision", async () => {
  let calls = 0;
  await assert.rejects(
    deployProviderRevision({
      environment,
      wait: async () => undefined,
      fetchImpl: async () => {
        calls += 1;
        return response({ id: "dep-render1", commit: { id: "b".repeat(40) } });
      },
    }),
  );
  assert.equal(calls, 1);
});

test("fails before Web deployment when Admin enters a terminal error", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "amanor-provider-"));
  const attemptPath = path.join(directory, "attempt.json");
  const values = [
    { id: "dep-render1", commit: { id: revision } },
    { id: "dep-render1", commit: { id: revision }, status: "live" },
    { id: "dpl_admin1", meta: { githubCommitSha: revision } },
    {
      id: "dpl_admin1",
      meta: { githubCommitSha: revision },
      readyState: "ERROR",
    },
  ];
  await assert.rejects(
    deployProviderRevision({
      environment: {
        ...environment,
        AMANOR_DEPLOYMENT_ATTEMPT_PATH: attemptPath,
      },
      wait: async () => undefined,
      fetchImpl: async () => response(values.shift()),
    }),
    /Admin CMS deployment failed/iu,
  );
  assert.equal(values.length, 0);
  const attempt = JSON.parse(await readFile(attemptPath, "utf8"));
  assert.equal(attempt.outcome, "failed");
  assert.equal(attempt.phase, "admin");
  assert.deepEqual(attempt.deployments, {
    api: {
      serviceId: "srv-amanorapi",
      deploymentId: "dep-render1",
      state: "live",
    },
    admin: {
      project: "amanor-admin",
      deploymentId: "dpl_admin1",
      state: "ERROR",
    },
  });
  assert.ok(!JSON.stringify(attempt).includes("token"));
});
