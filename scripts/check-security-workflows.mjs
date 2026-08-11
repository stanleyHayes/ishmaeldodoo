import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const codeql = await readFile(".github/workflows/codeql.yml", "utf8");
const quality = await readFile(".github/workflows/quality.yml", "utf8");

for (const invariant of [
  "pull_request:",
  "branches: [main]",
  "schedule:",
  "workflow_dispatch:",
  "security-events: write",
  "language: [javascript-typescript, actions]",
  "languages: ${{ matrix.language }}",
  "build-mode: none",
  "queries: security-extended",
  "github/codeql-action/init@v4",
  "github/codeql-action/analyze@v4",
])
  assert.ok(codeql.includes(invariant), `CodeQL workflow lost ${invariant}`);

assert.ok(
  codeql.includes("fail-fast: false"),
  "One CodeQL language failure must not suppress the other analysis result",
);

for (const image of ["api", "web", "admin"]) {
  const file = `amanor-${image}.sarif`;
  assert.ok(quality.includes(file), `Image scan lost SARIF output ${file}`);
  assert.match(
    quality,
    new RegExp(
      `github/codeql-action/upload-sarif@v4[\\s\\S]{0,180}sarif_file: ${file}`,
      "u",
    ),
    `${image} image findings are not uploaded to code scanning`,
  );
}

assert.equal(
  (quality.match(/uses: anchore\/scan-action@v6/gu) ?? []).length,
  3,
  "All three independently deployed images require vulnerability scans",
);
assert.equal(
  (quality.match(/severity-cutoff: high/gu) ?? []).length,
  3,
  "Every image scan must fail at high severity",
);
assert.equal(
  (quality.match(/only-fixed: true/gu) ?? []).length,
  3,
  "Every image scan must reject fixable findings",
);

process.stdout.write(
  "Security CI preserves CodeQL SAST and three image SARIF vulnerability gates.\n",
);
