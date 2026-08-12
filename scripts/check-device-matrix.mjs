import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile("playwright.config.ts", "utf8");
const suite = await readFile("e2e/device-network.spec.ts", "utf8");
const matrix = await readFile("docs/quality/device-network-matrix.md", "utf8");
const record = await readFile(
  "docs/quality/templates/device-lab-report.md",
  "utf8",
);
const lifecycleRecord = await readFile(
  "docs/operations/templates/protocol-desk-lifecycle-phone-record.md",
  "utf8",
);
const correspondenceRunbook = await readFile(
  "docs/operations/protocol-correspondence.md",
  "utf8",
);
const handover = await readFile("docs/handover/README.md", "utf8");

for (const project of ["android-emulated-3g", "android-emulated-2g"])
  if (!config.includes(project) || !suite.includes(project))
    throw new Error(`Device matrix is missing ${project}`);
for (const control of [
  "Network.emulateNetworkConditions",
  "chromium-emulation-not-physical-device",
  "data-mode",
  "Saved progress restored.",
  "toBeGreaterThanOrEqual(44)",
])
  if (!suite.includes(control))
    throw new Error(`Device suite is missing ${control}`);
for (const boundary of [
  "does not reproduce",
  "Current Samsung Internet",
  "Approved mid-range Android handset",
  "Real Wi-Fi/4G/3G/2G",
  "physical hardware",
])
  if (!matrix.includes(boundary))
    throw new Error(`Device matrix is missing evidence boundary: ${boundary}`);
const pendingReportSentinels = [
  "- Status: `Not run`",
  "- Release candidate and Web/API revisions: `Not recorded`",
  "- Staging origin: `Not recorded`",
  "- Test window: `Not recorded`",
  "- Operator: `Not assigned`",
  "| Mid-range Android | Not recorded | Chrome, not recorded           | Not recorded         | Wi-Fi/4G/3G/2G not measured | Not run      | Not run     | Not run            | Not attached | Not run |",
  "| Samsung handset   | Not recorded | Samsung Internet, not recorded | Not recorded         | Wi-Fi/4G/3G/2G not measured | Not run      | Not run     | Not run            | Not attached | Not run |",
  "| iPhone            | Not recorded | Safari, not recorded           | Not recorded         | Wi-Fi/4G/3G not measured    | Not run      | Not run     | Not run            | Not attached | Not run |",
  "- Synthetic Protocol Desk references and cleanup evidence location: `Not recorded`",
  "- QA approval/date: `Not approved`",
  "- Product approval/date: `Not approved`",
  "- Accessibility approval/date: `Not approved`",
];

function validatePendingReport(candidate) {
  for (const sentinel of pendingReportSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Device report no longer proves the pre-execution state: ${sentinel}`,
    );
}

const pendingLifecycleSentinels = [
  "- Status: `Not run`",
  "- Environment, release and Web/Admin/API revisions: `Not recorded`",
  "- Exercise window, timezone and synthetic request reference: `Not scheduled`",
  "- Approved email/calendar providers and evidence references: `Not recorded`",
  "- Desk Officer, Principal and observer identities/roles: `Not assigned`",
  "- Principal-owned phone model, OS and browser build: `Not recorded`",
  "- Viewport/orientation and Wi-Fi/mobile-network measurements: `Not recorded`",
  "- English/French and standard/Lite coverage: `Not run`",
  "- Six-step public intake, review, consent and durable receipt: `Not run`",
  "- Saved-progress resume/clear and submission cleanup: `Not run`",
  "- Acknowledgement and 48-hour status correspondence delivery/read: `Not run`",
  "- Desk triage, assignment, flags, notes and state evidence: `Not run`",
  "- Availability/calendar event and provider reconciliation: `Not run`",
  "- Approved rider/portrait and one-page Protocol Note evidence: `Not run`",
  "- Principal mailbox delivery and PDF attachment evidence: `Not run`",
  "- Four scanner-safe fragment links received and address-bar removal: `Not run`",
  "- Explicit confirmation, decline reason control and no accidental action: `Not run`",
  "- Selected capability accepted once; replay and sibling capabilities rejected: `Not run`",
  "- No horizontal overflow at 200% zoom and reduced-motion behavior: `Not run`",
  "- Screen-reader/keyboard or switch-control review on the same phone: `Not run`",
  "- No analytics, navigation chrome, referrer or cached decision content: `Not run`",
  "- Decision audit/event and governed correspondence delivery/read: `Not run`",
  "- Contracted, post-event delivered and archived transitions: `Not run`",
  "- Exactly one delayed follow-up and final calendar state: `Not run`",
  "- Immutable event/audit chain and protected evidence export: `Not run`",
  "- Provider outage/retry without duplicate delivery: `Not run`",
  "- Synthetic records, mailbox/calendar artifacts and access cleanup: `Not run`",
  "- Sensitive-content, personal-data, tokens and credentials non-disclosure review: `Not run`",
  "- Defects, owners, dates and successful retest evidence: `None recorded`",
  "- Principal approval/date: `Not approved`",
  "- Desk Operations approval/date: `Not approved`",
  "- QA/Accessibility approval/date: `Not approved`",
  "- Security/Privacy approval/date: `Not approved`",
];

function validatePendingLifecycle(candidate) {
  for (const sentinel of pendingLifecycleSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Protocol Desk phone record no longer proves pending state: ${sentinel}`,
    );
}

validatePendingLifecycle(lifecycleRecord);
for (const sentinel of pendingLifecycleSentinels)
  assert.throws(() =>
    validatePendingLifecycle(
      lifecycleRecord.replace(sentinel, "[prematurely changed]"),
    ),
  );
const lifecycleLink = "templates/protocol-desk-lifecycle-phone-record.md";
assert.ok(correspondenceRunbook.includes(lifecycleLink));
assert.ok(record.includes("protocol-desk-lifecycle-phone-record.md"));
assert.ok(
  handover.includes(
    "../operations/templates/protocol-desk-lifecycle-phone-record.md",
  ),
);

validatePendingReport(record);
for (const sentinel of pendingReportSentinels) {
  const mutated = record.replace(sentinel, "[prematurely changed]");
  assert.throws(
    () => validatePendingReport(mutated),
    undefined,
    `Device report accepted mutation of required sentinel: ${sentinel}`,
  );
}

process.stdout.write(
  `Device matrix preserves 2 Android network emulations and 3 explicit physical-device evidence rows; ${pendingReportSentinels.length} device and ${pendingLifecycleSentinels.length} Protocol Desk phone pending-state mutations fail closed.\n`,
);
