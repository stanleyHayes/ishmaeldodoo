import assert from "node:assert/strict";

const required = (name) => {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} is required`);
  return value;
};
const revision = required("REQUESTED_REVISION");
assert.match(revision, /^[0-9a-f]{40}$/u);

async function checkedFetch(url, options, label) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`${label} returned HTTP ${response.status}`);
  return response;
}

const renderHook = new URL(required("RENDER_DEPLOY_HOOK"));
renderHook.searchParams.set("ref", revision);
const render = await checkedFetch(
  renderHook,
  { method: "POST" },
  "Render exact-revision deploy",
);
const renderResult = await render.json();
assert.ok(
  typeof renderResult.deploy?.id === "string" ||
    typeof renderResult.id === "string" ||
    render.status === 202,
  "Render did not return a deploy identifier or queued response",
);

const token = required("VERCEL_TOKEN");
const teamId = process.env.VERCEL_TEAM_ID?.trim();
const endpoint = new URL("https://api.vercel.com/v13/deployments");
endpoint.searchParams.set("forceNew", "1");
if (teamId) endpoint.searchParams.set("teamId", teamId);
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function deployVercel(project, label) {
  const response = await checkedFetch(
    endpoint,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: project,
        gitSource: {
          type: "github",
          repoId: required("VERCEL_GITHUB_REPO_ID"),
          ref: revision,
          sha: revision,
        },
        target: required("VERCEL_TARGET"),
        meta: { amanorSourceRevision: revision },
      }),
    },
    `${label} exact-revision deploy`,
  );
  const deployment = await response.json();
  assert.match(deployment.id ?? "", /^dpl_[A-Za-z0-9]+$/u);
  assert.equal(
    deployment.meta?.githubCommitSha ?? deployment.meta?.amanorSourceRevision,
    revision,
    `${label} response does not bind the requested revision`,
  );
  process.stdout.write(`${label} deployment accepted as ${deployment.id}.\n`);
}

await deployVercel(required("VERCEL_ADMIN_PROJECT"), "Admin CMS");
await deployVercel(required("VERCEL_WEB_PROJECT"), "Public Web");
process.stdout.write("Render API exact-revision deployment accepted.\n");
