import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const script = "scripts/openapi-artifact.mjs";
const unsafeSources = [
  "https://example.com/v1/docs-json",
  "http://api.internal/v1/docs-json",
  "http://user:secret@127.0.0.1:4000/v1/docs-json",
  "http://127.0.0.1:4000/other",
  "http://127.0.0.1:4000/v1/docs-json?token=secret",
  "http://127.0.0.1:4000/v1/docs-json#fragment",
];

for (const source of unsafeSources) {
  const result = spawnSync(process.execPath, [script, "generate", source], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 5_000,
  });
  assert.notEqual(result.status, 0, `${source} must be rejected`);
  assert.match(
    `${result.stdout}${result.stderr}`,
    /local loopback API \/v1\/docs-json endpoint/u,
    `${source} failed for an unexpected reason`,
  );
}

process.stdout.write(
  "OpenAPI generation rejects remote, credentialed and path/query-divergent sources.\n",
);
