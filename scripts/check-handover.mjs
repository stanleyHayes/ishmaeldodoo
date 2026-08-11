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
if (!training.includes("Not run") || !training.includes("Blocked"))
  throw new Error("Training template must preserve honest unexecuted states");
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
  "Handover package structure and evidence states are valid.\n",
);
