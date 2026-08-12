import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runbook, handover, record] = await Promise.all([
  readFile("docs/operations/source-claim-audit.md", "utf8"),
  readFile("docs/handover/README.md", "utf8"),
  readFile("docs/operations/templates/source-claim-audit-record.md", "utf8"),
]);

const pendingSentinels = [
  "- Status: `Not run`",
  "- Environment, release and source-audit export digest: `Not recorded`",
  "- Export generated at and immutable evidence location: `Not recorded`",
  "- Content reviewer and Legal reviewer: `Not assigned`",
  "- English publications/references expected and reviewed: `0 / 0`",
  "- French publications/references expected and reviewed: `0 / 0`",
  "- Source Register entries expected and reviewed: `0 / 0`",
  "- Missing, duplicate and unused findings reconciled: `Not run`",
  "- Every claim opened against its exact underlying source: `Not run`",
  "- Claim meaning, date, number and attribution accuracy review: `Not run`",
  "- Same-locale suitability and translation fidelity review: `Not run`",
  "- Publication rights, licence and consent evidence review: `Not run`",
  "- Expiry, withdrawal and legal-hold obligations review: `Not run`",
  "- Confidential notes and restricted source material non-disclosure review: `Not run`",
  "- No-sampling coverage reconciliation: `Not run`",
  "- Defects, owners, target dates and corrected-version evidence: `None recorded`",
  "- Final rerun export digest and zero-open-gap result: `Not recorded`",
  "- Content approval/date: `Not approved`",
  "- Legal approval/date: `Not approved`",
];

function validatePendingRecord(candidate) {
  for (const sentinel of pendingSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Source audit record no longer proves the pre-execution state: ${sentinel}`,
    );
}

validatePendingRecord(record);
for (const sentinel of pendingSentinels)
  assert.throws(
    () =>
      validatePendingRecord(record.replace(sentinel, "[prematurely changed]")),
    undefined,
    `Source audit record accepted mutation of required sentinel: ${sentinel}`,
  );

assert.ok(
  runbook.includes("templates/source-claim-audit-record.md"),
  "Source audit runbook must link its controlled record",
);
assert.ok(
  handover.includes("../operations/templates/source-claim-audit-record.md"),
  "Handover must link the controlled source-audit record",
);
for (const requirement of [
  "inspect every report row with no sampling",
  "verify the claim is accurately supported",
  "confirm publication rights/consent",
])
  assert.ok(
    runbook.includes(requirement),
    `Runbook is missing: ${requirement}`,
  );

process.stdout.write(
  `Source/claim audit evidence is linked and ${pendingSentinels.length} pending-state mutations fail closed.\n`,
);
