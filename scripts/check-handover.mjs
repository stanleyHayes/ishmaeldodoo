import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const required = new Map([
  [
    "docs/handover/README.md",
    ["Deployable ownership", "Handover acceptance checklist"],
  ],
  [
    "docs/handover/cms-operator-guide.md",
    ["Content lifecycle", "Governed media", "Protocol Desk"],
  ],
  [
    "docs/handover/security-incident-response.md",
    ["Declare and contain", "Scenario actions", "Recovery and closure"],
  ],
  [
    "docs/handover/release-notes.md",
    ["Known launch blockers", "Upgrade and rollback notes"],
  ],
  [
    "docs/handover/training-evidence.md",
    ["Scenarios", "Competency and acceptance"],
  ],
]);

for (const [path, phrases] of required) {
  await access(path);
  const content = await readFile(path, "utf8");
  for (const phrase of phrases) {
    if (!content.includes(phrase))
      throw new Error(`${path} is missing required section: ${phrase}`);
  }
}

const index = await readFile("docs/handover/README.md", "utf8");
for (const linked of [
  "cms-operator-guide.md",
  "security-incident-response.md",
  "release-notes.md",
  "training-evidence.md",
]) {
  if (!index.includes(`](${linked})`))
    throw new Error(`Handover index does not link ${linked}`);
}

const training = await readFile("docs/handover/training-evidence.md", "utf8");
const pendingTrainingSentinels = [
  "- Environment: `Not recorded`",
  "- Source/release revision: `Not recorded`",
  "- Date and timezone: `Not scheduled`",
  "- Trainer: `Not assigned`",
  "- Observer: `Not assigned`",
  "- Participants and assigned roles: `Not assigned`",
  "- Production-like limitations: `Not assessed`",
  "| Bilingual draft, independent review and publish                        | Editor, Translator, Reviewer         |           | Not run |                    |                      |",
  "| Locale-specific takedown and correct restoration within 15 minutes     | Principal/Reviewer, Engineer         |           | Not run |                    |                      |",
  "| Media upload, governance and reference-safe retirement                 | Press Officer/Editor                 |           | Not run |                    |                      |",
  "| Account invitation, MFA enrollment, role change and session revocation | Security Administrator, invited user |           | Not run |                    |                      |",
  "| Physical security-key enrollment, assertion and audited revocation     | Security Administrator, Principal    |           | Blocked |                    | AMANOR-050/116       |",
  "| Protocol Desk receipt-to-close with correspondence and availability    | Desk Officer, Principal              |           | Not run |                    |                      |",
  "| SLA/provider failure acknowledgement and recovery                      | Desk Officer, on-call                |           | Not run |                    |                      |",
  "| Alert, deploy and independent rollback drill                           | Engineer/on-call                     |           | Not run |                    |                      |",
  "| Subject-access/deletion and restored-backup reconciliation             | Privacy owner, Engineer              |           | Not run |                    |                      |",
  "| Lost-key containment, spare-key custody and supervised recovery        | Principal, Security, recovery owners |           | Blocked |                    | AMANOR-050/116       |",
  "| Room hardware-key access and recipient-key loss recovery               | Principal, designate, Security       |           | Blocked |                    | AMANOR-093/096       |",
  "- Trainer sign-off: `Not signed`",
  "- Participant acknowledgements: `Not signed`",
  "- Product acceptance: `Not approved`",
  "- Security/Privacy acceptance where applicable: `Not approved`",
  "- Rehearsal defects added to ledger: `Not assessed`",
];

function validatePendingTraining(candidate) {
  for (const sentinel of pendingTrainingSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Training record no longer proves the pre-execution state: ${sentinel}`,
    );
}

validatePendingTraining(training);
for (const sentinel of pendingTrainingSentinels) {
  const mutated = training.replace(sentinel, "[prematurely changed]");
  assert.throws(
    () => validatePendingTraining(mutated),
    undefined,
    `Training record accepted mutation of required sentinel: ${sentinel}`,
  );
}
for (const requirement of [
  "Physical security-key enrollment, assertion and audited revocation",
  "Lost-key containment, spare-key custody and supervised recovery",
])
  if (!training.includes(requirement))
    throw new Error(
      `Training template is missing WebAuthn scenario: ${requirement}`,
    );

for (const [path, evidence] of [
  ["docs/handover/README.md", "../security/webauthn-hardware-keys.md"],
  ["docs/handover/cms-operator-guide.md", "Enrol local security key"],
  ["docs/handover/release-notes.md", "20260811_032_webauthn_hardware_keys"],
  [
    "docs/handover/security-incident-response.md",
    "Lost or suspect WebAuthn key",
  ],
]) {
  const content = await readFile(path, "utf8");
  if (!content.includes(evidence))
    throw new Error(
      `${path} is missing WebAuthn handover evidence: ${evidence}`,
    );
}

process.stdout.write(
  `Handover package structure is valid; ${pendingTrainingSentinels.length} training-session, scenario and acceptance mutations fail closed.\n`,
);
