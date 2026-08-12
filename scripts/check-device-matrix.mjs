import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile("playwright.config.ts", "utf8");
const suite = await readFile("e2e/device-network.spec.ts", "utf8");
const matrix = await readFile("docs/quality/device-network-matrix.md", "utf8");
const record = await readFile(
  "docs/quality/templates/device-lab-report.md",
  "utf8",
);

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
  `Device matrix preserves 2 Android network emulations and 3 explicit physical-device evidence rows; ${pendingReportSentinels.length} pre-execution evidence mutations fail closed.\n`,
);
