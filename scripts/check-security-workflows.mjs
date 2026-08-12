import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const codeql = await readFile(".github/workflows/codeql.yml", "utf8");
const quality = await readFile(".github/workflows/quality.yml", "utf8");
const governance = await readFile(
  "docs/operations/github-repository-governance.md",
  "utf8",
);
const disclosurePolicy = await readFile("SECURITY.md", "utf8");
const supplyChainAcceptance = await readFile(
  "docs/security/templates/image-supply-chain-acceptance-record.md",
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

const pendingSupplyChainSentinels = [
  "- Status: `Not run`",
  "- Environment, release and immutable source revision: `Not recorded`",
  "- Registry provider, account, region and repository identifiers: `Not selected`",
  "- Build workflow run, runner identity and trusted-builder revision: `Not recorded`",
  "- Signing method, issuer and expected identity policy: `Not approved`",
  "- Transparency log or managed audit-log evidence: `Not recorded`",
  "- Registry tag immutability and digest-only deployment proof: `Not run`",
  "- Registry retention, deletion protection and vulnerability-rescan policy: `Not approved`",
  "- Build isolation, least privilege and credential-lifetime evidence: `Not run`",
  "- Source revision and lockfile digests match provenance subjects: `Not run`",
  "- Provenance builder/workflow/ref/repository identity verified: `Not run`",
  "- Signature identity and certificate/managed-key policy verified: `Not run`",
  "- Signature, provenance, SBOM and scan all bind each exact image digest: `Not run`",
  "- High/critical fixable vulnerability result is zero for all three images: `Not run`",
  "- Render/Vercel release artifacts map to the reviewed deployable digests: `Not run`",
  "- Promotion rejects unsigned, mismatched, mutable-tag and untrusted-builder artifacts: `Not run`",
  "- Prior Web/Admin/API rollback digests remain available and verifiable: `Not run`",
  "- Signing identity/key compromise, revocation and emergency rebuild drill: `Not run`",
  "- Superseded test tags/artifacts and temporary credentials removed: `Not run`",
  "- Defects, severity, owners, target dates and retest evidence: `None recorded`",
  "- Engineering/Release approval and date: `Not approved`",
  "- Security approval and date: `Not approved`",
  "- Operations acceptance and date: `Not approved`",
];

function validatePendingSupplyChain(candidate) {
  for (const sentinel of pendingSupplyChainSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Image supply-chain record no longer proves pending state: ${sentinel}`,
    );
  for (const deployable of ["Public Web", "Admin/CMS", "NestJS API"])
    assert.match(
      candidate,
      new RegExp(
        `^\\| ${deployable.replace("/", "\\/")}\\s+\\| Not recorded\\s+\\| Not recorded\\s+\\| Not recorded\\s+\\| Not recorded\\s+\\| Not run\\s+\\| Not run\\s+\\|$`,
        "mu",
      ),
      `Image supply-chain record lost pending ${deployable} artifact row`,
    );
}

validatePendingSupplyChain(supplyChainAcceptance);
for (const sentinel of pendingSupplyChainSentinels)
  assert.throws(
    () =>
      validatePendingSupplyChain(
        supplyChainAcceptance.replace(sentinel, "[prematurely changed]"),
      ),
    undefined,
    `Image supply-chain record accepted premature mutation: ${sentinel}`,
  );
for (const deployable of ["Public Web", "Admin/CMS", "NestJS API"])
  assert.throws(
    () =>
      validatePendingSupplyChain(
        supplyChainAcceptance.replace(
          new RegExp(`^\\| ${deployable.replace("/", "\\/")}.*$`, "mu"),
          "[prematurely changed]",
        ),
      ),
    undefined,
    `Image supply-chain record accepted premature ${deployable} row mutation`,
  );

for (const evidence of [
  "Private vulnerability reporting: `Enabled`",
  "Dependabot security updates: `Enabled`",
  "Secret scanning and push protection: `Enabled`",
  "Non-provider pattern scanning and validity checks: `Unavailable/disabled`",
  "private advisory channel",
])
  assert.ok(
    governance.includes(evidence),
    `Repository governance lost native security state: ${evidence}`,
  );
for (const evidence of [
  "security/advisories/new",
  "Do not open a public issue",
  "Only the current `main` revision is supported",
  "does not authorize testing production",
])
  assert.ok(
    disclosurePolicy.includes(evidence),
    `Security disclosure policy lost required boundary: ${evidence}`,
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
  `Security CI preserves CodeQL SAST and three image SARIF vulnerability gates; active main-history protection is recorded while ${pendingRequiredCheckSentinels.length} required-check and ${pendingSupplyChainSentinels.length + 3} image supply-chain fields fail closed.\n`,
);
