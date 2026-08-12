import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const codeql = await readFile(".github/workflows/codeql.yml", "utf8");
const quality = await readFile(".github/workflows/quality.yml", "utf8");
const governance = await readFile(
  "docs/operations/github-repository-governance.md",
  "utf8",
);

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
  "actions/checkout@v7",
  "github/codeql-action/init@v4",
  "github/codeql-action/analyze@v4",
])
  assert.ok(codeql.includes(invariant), `CodeQL workflow lost ${invariant}`);

assert.ok(
  codeql.includes("fail-fast: false"),
  "One CodeQL language failure must not suppress the other analysis result",
);

for (const runtimeAction of [
  "actions/checkout@v7",
  "actions/setup-node@v7",
  "actions/upload-artifact@v7",
  "dorny/paths-filter@v4",
  "gitleaks/gitleaks-action@v3",
])
  assert.ok(
    quality.includes(runtimeAction),
    `Quality workflow lost current Node 24 action ${runtimeAction}`,
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
  (quality.match(/uses: anchore\/scan-action@v7/gu) ?? []).length,
  3,
  "All three independently deployed images require vulnerability scans",
);

for (const evidence of [
  "Active history ruleset: `20725073` (`Protect main history`)",
  "blocks branch deletion plus non-fast-forward updates",
  "This is a history-integrity control, not a claim that post-push CI is a\npre-merge gate",
])
  assert.ok(
    governance.includes(evidence),
    `Repository governance lost verified history-protection evidence: ${evidence}`,
  );

const pendingRequiredCheckSentinels = [
  "- Status: `Not approved`",
  "- Delivery-model owner and decision reference: `Not recorded`",
  "- Pull-request or merge-queue workflow selected: `Not selected`",
  "- Required `Quality` check name and successful trial run: `Not recorded`",
  "- Required CodeQL check names and successful trial runs: `Not recorded`",
  "- Required approving-review count and code-owner policy: `Not approved`",
  "- Stale-review dismissal and conversation-resolution policy: `Not approved`",
  "- Administrator/bypass actors and emergency procedure: `Not approved`",
  "- Signed-commit requirement decision: `Not approved`",
  "- Linear-history requirement decision: `Not approved`",
  "- Ruleset export before/after and rollback procedure: `Not recorded`",
  "- Failed-check, stale-review and emergency-release drills: `Not run`",
  "- Engineering approval and date: `Not approved`",
  "- Security approval and date: `Not approved`",
  "- Product/Operations acceptance and date: `Not approved`",
];

function validatePendingRequiredChecks(candidate) {
  for (const sentinel of pendingRequiredCheckSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Repository governance no longer proves pending required-check state: ${sentinel}`,
    );
}

validatePendingRequiredChecks(governance);
for (const sentinel of pendingRequiredCheckSentinels)
  assert.throws(
    () =>
      validatePendingRequiredChecks(
        governance.replace(sentinel, "[prematurely changed]"),
      ),
    undefined,
    `Repository governance accepted premature transition mutation: ${sentinel}`,
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
  `Security CI preserves CodeQL SAST and three image SARIF vulnerability gates; active main-history protection is recorded while ${pendingRequiredCheckSentinels.length} required-check transition fields fail closed.\n`,
);
