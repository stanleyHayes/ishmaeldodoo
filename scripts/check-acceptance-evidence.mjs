import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const templates = new Map([
  [
    "uat-report.md",
    {
      required: [
        "## Defects",
        "## Enhancement requests",
        "Release candidate ID",
      ],
      pending: [
        "- Status: Not run",
        "- Approval: Not approved",
        "- QA signature/date: Not signed",
        "- Product signature/date: Not signed",
        "- Principal signature/date where required: Not signed",
      ],
    },
  ],
  [
    "beta-report.md",
    {
      required: [
        "## Entry controls",
        "## Incidents, defects and enhancements",
        "Exact promoted release/digests",
      ],
      pending: [
        "- Status: Not run",
        "- Approval: Not approved",
        "- Beta outcome: Not approved",
        "- Product signature/date: Not signed",
        "- Operations signature/date: Not signed",
        "- Security/Privacy signature/date: Not signed",
      ],
    },
  ],
  [
    "production-launch-record.md",
    {
      required: [
        "## Content freeze and entry approvals",
        "## Monitoring and rollback watch",
        "Web/Admin/API image digests",
      ],
      pending: [
        "- Status: Not run",
        "- Approval: Not approved",
        "- Production validation: Not approved",
        "- Release Manager signature/date: Not signed",
        "- Product/Operations/Security signatures/dates: Not signed",
      ],
    },
  ],
  [
    "acceptance-certificate.md",
    {
      required: [
        "## Exceptions and residual obligations",
        "## Acceptance decision",
        "Production release ID",
      ],
      pending: [
        "- Status: Not signed",
        "- Functional/content acceptance: Not approved",
        "- Security/privacy/accessibility acceptance: Not approved",
        "- Operations/support acceptance: Not approved",
        "- Principal signature/date: Not signed",
        "- Product signature/date: Not signed",
        "- Delivery signature/date: Not signed",
      ],
    },
  ],
  [
    "hypercare-report.md",
    {
      required: [
        "## Incidents",
        "## Defects",
        "## Enhancements",
        "## Exit and support transition",
      ],
      pending: [
        "- Status: Not run",
        "- Approved window: Not scheduled",
        "- Exit authority: Not assigned",
        "- Operations exit decision: Not approved",
        "- Product/Operations signatures/dates: Not signed",
      ],
    },
  ],
  [
    "project-closure-record.md",
    {
      required: [
        "## Preconditions",
        "## Evidence archive",
        "## Closure decision and signatures",
      ],
      pending: [
        "- Status: Not run",
        "- Approval: Not approved",
        "- Final acceptance certificate: Not signed",
        "- Hypercare exit: Not approved",
        "- Required evidence complete and access-tested: Not approved",
        "- Delivery Lead signature/date: Not signed",
        "- Product/Operations signatures/dates: Not signed",
      ],
    },
  ],
]);

function validatePendingTemplate(file, content, contract) {
  const { required, pending } = contract;
  for (const phrase of required)
    assert.ok(
      content.includes(phrase),
      `${file} lost required section ${phrase}`,
    );
  for (const sentinel of pending)
    assert.ok(
      content.includes(sentinel),
      `${file} no longer proves the pre-execution state: ${sentinel}`,
    );
  assert.doesNotMatch(content, /Status:\s*(?:Complete|Approved|Passed)/iu);
}

for (const [file, contract] of templates) {
  const content = await readFile(`docs/operations/templates/${file}`, "utf8");
  validatePendingTemplate(file, content, contract);
  for (const sentinel of contract.pending) {
    const mutated = content.replace(sentinel, "[prematurely changed]");
    assert.throws(
      () => validatePendingTemplate(file, mutated, contract),
      undefined,
      `${file} accepted mutation of required sentinel: ${sentinel}`,
    );
  }
}

const guide = await readFile("docs/operations/release-acceptance.md", "utf8");
for (const file of templates.keys())
  assert.ok(
    guide.includes(`templates/${file}`),
    `Acceptance guide does not link ${file}`,
  );
for (const classification of ["defects", "enhancement", "incidents"])
  assert.ok(guide.toLowerCase().includes(classification));

process.stdout.write(
  `Release acceptance package preserves ${templates.size} controlled, honestly unexecuted evidence records and rejects ${[...templates.values()].reduce((total, contract) => total + contract.pending.length, 0)} premature state/signature mutations.\n`,
);
