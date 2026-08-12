import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const codeql = await readFile(".github/workflows/codeql.yml", "utf8");
const quality = await readFile(".github/workflows/quality.yml", "utf8");
const deploy = await readFile(".github/workflows/deploy.yml", "utf8");
const governance = await readFile(
  "docs/operations/github-repository-governance.md",
  "utf8",
);
const disclosurePolicy = await readFile("SECURITY.md", "utf8");
const supplyChainAcceptance = await readFile(
  "docs/security/templates/image-supply-chain-acceptance-record.md",
  "utf8",
);
const codeqlTriage = await readFile(
  "docs/security/templates/codeql-triage-record.md",
  "utf8",
);
const pinnedActions = new Map([
  ["actions/checkout", ["3d3c42e5aac5ba805825da76410c181273ba90b1", "v7"]],
  ["actions/setup-node", ["820762786026740c76f36085b0efc47a31fe5020", "v7"]],
  [
    "actions/upload-artifact",
    ["043fb46d1a93c77aae656e7c1c64a875d1fc6a0a", "v7"],
  ],
  [
    "gitleaks/gitleaks-action",
    ["e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e", "v3"],
  ],
  ["dorny/paths-filter", ["ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d", "v4"]],
  ["anchore/sbom-action", ["e22c389904149dbc22b58101806040fa8d37a610", "v0"]],
  ["anchore/scan-action", ["e1165082ffb1fe366ebaf02d8526e7c4989ea9d2", "v7"]],
  ["github/codeql-action", ["5595ccaf912efad79be6eef63a5619ff05969be3", "v4"]],
]);

const pendingCodeqlTriageSentinels = [
  "- Status: `Awaiting Security approval`",
  "- Open-alert snapshot: `8`",
  "- Security approver and date: `Not approved`",
  "| 15-16  | High",
  "| 21     | Medium",
  "| 22     | Medium",
  "| 23-24  | Medium",
  "| 25     | Medium",
  "| 26     | Medium",
  "No approval may be inferred from a successful CodeQL run or this engineering",
];

function validatePendingCodeqlTriage(candidate) {
  for (const sentinel of pendingCodeqlTriageSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `CodeQL triage lost pending evidence: ${sentinel}`,
    );
  assert.equal(
    (candidate.match(/\| Not approved\s+\|/gu) ?? []).length,
    6,
    "Every CodeQL alert group requires an explicit pending Security decision",
  );
}

validatePendingCodeqlTriage(codeqlTriage);
for (const sentinel of pendingCodeqlTriageSentinels)
  assert.throws(
    () =>
      validatePendingCodeqlTriage(
        codeqlTriage.replace(sentinel, "[prematurely changed]"),
      ),
    undefined,
    `CodeQL triage accepted premature mutation: ${sentinel}`,
  );

for (const source of [codeql, quality, deploy]) {
  const actionUses = [
    ...source.matchAll(/^\s*uses:\s+([^\s#]+)(?:\s+#\s+(\S+))?$/gmu),
  ];
  assert.ok(actionUses.length > 0, "Workflow must contain external actions");
  for (const [, reference, comment] of actionUses) {
    const separator = reference.lastIndexOf("@");
    const action = reference.slice(0, separator);
    const revision = reference.slice(separator + 1);
    const baseAction = action.startsWith("github/codeql-action/")
      ? "github/codeql-action"
      : action;
    const expected = pinnedActions.get(baseAction);
    assert.ok(
      expected,
      `Workflow uses an unreviewed external action ${action}`,
    );
    assert.match(revision, /^[0-9a-f]{40}$/u, `${action} is not SHA-pinned`);
    assert.equal(
      revision,
      expected[0],
      `${action} drifted from reviewed commit`,
    );
    assert.equal(
      comment,
      expected[1],
      `${action} lost its reviewed tag comment`,
    );
  }
}

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
  `actions/checkout@${pinnedActions.get("actions/checkout")[0]}`,
  `github/codeql-action/init@${pinnedActions.get("github/codeql-action")[0]}`,
  `github/codeql-action/analyze@${pinnedActions.get("github/codeql-action")[0]}`,
])
  assert.ok(codeql.includes(invariant), `CodeQL workflow lost ${invariant}`);

assert.ok(
  codeql.includes("fail-fast: false"),
  "One CodeQL language failure must not suppress the other analysis result",
);

for (const runtimeAction of [
  "actions/checkout",
  "actions/setup-node",
  "actions/upload-artifact",
  "dorny/paths-filter",
  "gitleaks/gitleaks-action",
])
  assert.ok(
    quality.includes(`${runtimeAction}@${pinnedActions.get(runtimeAction)[0]}`),
    `Quality workflow lost current Node 24 action ${runtimeAction}`,
  );

for (const image of ["api", "web", "admin"]) {
  const file = `amanor-${image}.sarif`;
  assert.ok(quality.includes(file), `Image scan lost SARIF output ${file}`);
  assert.match(
    quality,
    new RegExp(
      `github/codeql-action/upload-sarif@${pinnedActions.get("github/codeql-action")[0]}[\\s\\S]{0,220}sarif_file: ${file}`,
      "u",
    ),
    `${image} image findings are not uploaded to code scanning`,
  );
}

assert.equal(
  (
    quality.match(
      new RegExp(
        `uses: anchore/scan-action@${pinnedActions.get("anchore/scan-action")[0]}`,
        "gu",
      ),
    ) ?? []
  ).length,
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

for (const evidence of [
  "Actions allowed policy: `Selected actions only`",
  "Actions SHA-pinning policy: `Required`",
  "Default workflow token: `Read-only; cannot approve pull requests`",
  "GitHub-owned actions: `Allowed`",
  "All verified Marketplace actions: `Denied`",
  "Reviewed third-party actions: `gitleaks/gitleaks-action`, `dorny/paths-filter`, `anchore/sbom-action`, `anchore/scan-action`",
  "never `allowed_actions: all`",
])
  assert.ok(
    governance.includes(evidence),
    `Repository governance lost Actions permission evidence: ${evidence}`,
  );

for (const evidence of [
  "GitHub deployment namespaces: `preview`, `staging`, `production`",
  "Staging/production branch policy: `Protected branches only`",
  "Preview branch policy: `Any branch for pull-request previews`",
  "These namespaces contain no secrets, variables,\nreviewers or deployments",
  "The manual deployment workflow targets each namespace but remains fail-closed",
  "trust-boundary preparation, not evidence",
])
  assert.ok(
    governance.includes(evidence),
    `Repository governance lost deployment-namespace evidence: ${evidence}`,
  );

const pendingEnvironmentIntegrationSentinels = [
  "- Status: `Not integrated`",
  "- Manual preview/staging/production workflow definition: `Implemented; not executed`",
  "- Preview workflow/job and pull-request deployment evidence: `Not run`",
  "- Staging workflow/job and protected-main deployment evidence: `Not run`",
  "- Production workflow/job and approved-promotion evidence: `Not run`",
  "- Web/Admin/API provider resources mapped per namespace: `Not provisioned`",
  "- Environment-scoped secret and variable inventory reconciliation: `Not run`",
  "- Preview/staging noindex and edge-access verification: `Not run`",
  "- Production indexing and custom-domain verification: `Not run`",
  "- Staging and production required reviewers: `Not approved`",
  "- Self-review prevention and emergency bypass policy: `Not approved`",
  "- Deployment history, exact revision and provider-release linkage: `Not run`",
  "- Environment deletion/rename protection and recovery procedure: `Not approved`",
  "- Deployment Engineering/Operations approval and date: `Not approved`",
  "- Deployment Security approval and date: `Not approved`",
  "- Deployment Product acceptance and date: `Not approved`",
];

for (const invariant of [
  "workflow_dispatch:",
  "environment: ${{ inputs.environment }}",
  "cancel-in-progress: false",
  "actions: read",
  "persist-credentials: false",
  "validate-deployment-dispatch.mjs",
  "verify-hosted-gates.mjs",
  "deploy-provider-revision.mjs",
  "wait-for-deployment-smoke.mjs",
])
  assert.ok(
    deploy.includes(invariant),
    `Deployment workflow lost ${invariant}`,
  );
for (const forbidden of ["pull_request:", "push:", "VERCEL_DEPLOY_HOOK"])
  assert.ok(
    !deploy.includes(forbidden),
    `Deployment workflow must not contain ${forbidden}`,
  );

function validatePendingEnvironmentIntegration(candidate) {
  for (const sentinel of pendingEnvironmentIntegrationSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Repository governance no longer proves pending environment integration: ${sentinel}`,
    );
}

validatePendingEnvironmentIntegration(governance);
for (const sentinel of pendingEnvironmentIntegrationSentinels)
  assert.throws(
    () =>
      validatePendingEnvironmentIntegration(
        governance.replace(sentinel, "[prematurely changed]"),
      ),
    undefined,
    `Repository governance accepted premature environment integration: ${sentinel}`,
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
  `Security CI preserves CodeQL SAST and three image SARIF vulnerability gates; active main-history protection is recorded while ${pendingRequiredCheckSentinels.length} required-check, ${pendingEnvironmentIntegrationSentinels.length} environment-integration and ${pendingSupplyChainSentinels.length + 3} image supply-chain fields fail closed.\n`,
);
