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
for (const field of [
  "Status: `Not run`",
  "Samsung Internet",
  "Synthetic Protocol Desk references and cleanup evidence location",
  "QA approval/date: `Not approved`",
  "Product approval/date: `Not approved`",
  "Accessibility approval/date: `Not approved`",
])
  if (!record.includes(field))
    throw new Error(`Device report is missing ${field}`);

process.stdout.write(
  "Device matrix preserves 2 Android network emulations and 3 explicit physical-device evidence rows.\n",
);
