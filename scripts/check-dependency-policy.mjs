import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const dependabot = parse(await readFile(".github/dependabot.yml", "utf8"));
const pnpmWorkspace = parse(await readFile("pnpm-workspace.yaml", "utf8"));
const pnpmLock = parse(await readFile("pnpm-lock.yaml", "utf8"));
assert.equal(dependabot.version, 2, "Dependabot must use schema version 2");

const updates = Array.isArray(dependabot.updates) ? dependabot.updates : [];
let npmUpdate;
for (const ecosystem of ["npm", "github-actions"]) {
  const update = updates.find(
    (entry) => entry?.["package-ecosystem"] === ecosystem,
  );
  assert.ok(update, `Dependabot lost the ${ecosystem} update lane`);
  assert.equal(
    update.directory,
    "/",
    `${ecosystem} updates must cover the root`,
  );
  assert.equal(
    update.schedule?.interval,
    "weekly",
    `${ecosystem} updates must run weekly`,
  );
  if (ecosystem === "npm") npmUpdate = update;
}

const majorHoldNames = new Set(
  (npmUpdate?.ignore ?? [])
    .filter((entry) =>
      entry?.["update-types"]?.includes("version-update:semver-major"),
    )
    .map((entry) => entry["dependency-name"]),
);
assert.deepEqual(
  majorHoldNames,
  new Set(["eslint", "@eslint/js", "typescript"]),
  "Dependabot major holds must match the reviewed incompatible toolchain",
);

assert.deepEqual(
  pnpmWorkspace.packages,
  ["apps/*", "packages/*"],
  "pnpm must cover the same workspace boundaries as npm",
);
assert.equal(
  pnpmWorkspace.linkWorkspacePackages,
  true,
  "pnpm must resolve @amanor packages from the workspace",
);
const requiredSecurityOverrides = {
  "js-yaml": "5.2.3",
  tmp: "0.2.7",
  uuid: "11.1.1",
};
assert.deepEqual(
  pnpmWorkspace.overrides,
  requiredSecurityOverrides,
  "pnpm security overrides must match the reviewed patched graph",
);
assert.deepEqual(
  pnpmLock.overrides,
  requiredSecurityOverrides,
  "pnpm lockfile lost the reviewed security overrides",
);
for (const vulnerable of [
  "tmp@0.0.33",
  "tmp@0.1.0",
  "uuid@8.3.2",
  "js-yaml@5.2.1",
])
  assert.ok(
    !Object.hasOwn(pnpmLock.packages ?? {}, vulnerable),
    `pnpm lockfile retains vulnerable package ${vulnerable}`,
  );

const policy = await readFile("docs/quality/dependency-currency.md", "utf8");
for (const evidence of [
  /\|\s*ESLint\s*\|\s*9\.39\.5\s*\|\s*10\.8\.1\s*\|/u,
  /\|\s*TypeScript\s*\|\s*6\.0\.3\s*\|\s*7\.0\.2\s*\|/u,
  /typescript >=4\.8\.4 <6\.1\.0/u,
  /known-incompatible ESLint,/u,
  /no forced or legacy peer-dependency mode/u,
])
  assert.ok(
    evidence.test(policy),
    `Dependency policy lost compatibility evidence: ${evidence}`,
  );

const graph = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["ls", "eslint", "typescript", "--all", "--json"],
  { encoding: "utf8" },
);
assert.equal(
  graph.status,
  0,
  `Installed lint/type graph has invalid peer edges:\n${graph.stderr || graph.stdout}`,
);

process.stdout.write(
  "Dependency policy preserves weekly update discovery, synchronized npm/pnpm security overrides and a peer-valid ESLint/TypeScript graph.\n",
);
