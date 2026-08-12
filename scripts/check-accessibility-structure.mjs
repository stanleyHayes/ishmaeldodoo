import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function assertFocusableMainTargets(source, label, minimum = 1) {
  const targets = [
    ...source.matchAll(/<main\b[^>]*\bid="main-content"[^>]*>/gu),
  ];
  if (targets.length < minimum)
    throw new Error(
      `${label} exposes only ${targets.length} main-content targets`,
    );
  for (const [tag] of targets) {
    if (!/\btabIndex=\{-1\}/u.test(tag))
      throw new Error(`${label} has a skip target that cannot receive focus`);
  }
  return targets.length;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) return [];
    if (entry.name.endsWith(".test.tsx")) return [];
    return readFileSync(path, "utf8").includes('id="main-content"')
      ? [path]
      : [];
  });
}

const files = sourceFiles("apps/web/src");
const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
const count = assertFocusableMainTargets(source, "Public application", 13);
const manualMatrix = readFileSync("docs/quality/manual-at-matrix.md", "utf8");

const layout = readFileSync("apps/web/src/app/layout.tsx", "utf8");
const skipLink = readFileSync(
  "apps/web/src/components/site/skip-link.tsx",
  "utf8",
);
if (!/<SkipLink/u.test(layout) || !/href="#main-content"/u.test(skipLink))
  throw new Error("Public layout does not expose the canonical skip link");
for (const requirement of [
  'getElementById("main-content")',
  "event.preventDefault()",
  "target.focus({ preventScroll: true })",
  "target.scrollIntoView",
]) {
  if (!skipLink.includes(requirement))
    throw new Error(
      `Skip link is missing cross-engine behavior: ${requirement}`,
    );
}

try {
  assertFocusableMainTargets('<main id="main-content">', "Negative fixture");
  throw new Error("Non-focusable skip-target fixture unexpectedly passed");
} catch (error) {
  if (!/cannot receive focus/u.test(String(error))) throw error;
}

const manualEvidenceSentinels = [
  "`PARTIAL PASS - 11 Aug 2026`",
  "Wider page/template coverage, Safari comparison and review by an experienced VoiceOver user remain.",
  "| NVDA",
  "Windows with current Firefox and Chrome",
  "| `NOT RUN`                    | Requires the controlled Windows assistive-technology lab and a named reviewer.",
  "| TalkBack",
  "Physical mid-range Android and Samsung Internet/Chrome",
  "| `NOT RUN`                    | Requires the physical device/network lab already tracked by AMANOR-138.",
  "| Independent WCAG 2.2 AA audit",
  "| `NOT COMMISSIONED`",
  "AMANOR-142 remains blocked until an external auditor is appointed and staging is available.",
  "No VoiceOver audio transcript, NVDA result, TalkBack result, experienced-user",
  "approval or external conformance statement is claimed by this record.",
];

function validateManualEvidence(candidate) {
  for (const sentinel of manualEvidenceSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Manual AT matrix no longer preserves its evidence boundary: ${sentinel}`,
    );
}

validateManualEvidence(manualMatrix);
for (const sentinel of manualEvidenceSentinels) {
  const mutated = manualMatrix.replace(sentinel, "[prematurely changed]");
  assert.throws(
    () => validateManualEvidence(mutated),
    undefined,
    `Manual AT matrix accepted mutation of required boundary: ${sentinel}`,
  );
}

process.stdout.write(
  `All ${count} public main-content targets receive programmatic focus; the non-focusable fixture and ${manualEvidenceSentinels.length} manual AT evidence mutations failed closed.\n`,
);
