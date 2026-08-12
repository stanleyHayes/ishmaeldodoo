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
const auditRecord = readFileSync(
  "docs/quality/templates/wcag-audit-remediation-record.md",
  "utf8",
);
const handover = readFileSync("docs/handover/README.md", "utf8");

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

const pendingAuditSentinels = [
  "- Status: `Not commissioned`",
  "- Auditor organisation, lead and independence declaration: `Not assigned`",
  "- Contract/scope reference and audit methodology: `Not recorded`",
  "- Production-like environment, release and Web/Admin/API revisions: `Not recorded`",
  "- Audit window and final-report immutable evidence location: `Not scheduled`",
  "- Public P01-P13 English/French standard/Sahel coverage: `Not run`",
  "- Admin/CMS authentication, content, media and operations coverage: `Not run`",
  "- Protocol Desk, Contact and Room enabled/disabled boundary coverage: `Not run`",
  "- Desktop browsers and Windows/macOS assistive technologies: `Not run`",
  "- Physical mobile browsers, TalkBack/VoiceOver and real-network coverage: `Not run`",
  "- Keyboard, focus, reflow, zoom, contrast, motion and error recovery: `Not run`",
  "- Images, maps, tables, PDF/download and time-based media alternatives: `Not run`",
  "- WCAG 2.2 A/AA success-criterion applicability matrix: `Not recorded`",
  "- Critical findings opened/closed/retested: `0 / 0 / 0`",
  "- High findings opened/closed/retested: `0 / 0 / 0`",
  "- Medium findings opened/closed/retested: `0 / 0 / 0`",
  "- Low findings opened/closed/retested: `0 / 0 / 0`",
  "- Finding IDs, owners, target versions and remediation evidence: `None recorded`",
  "- Auditor retest and zero-open-critical/high result: `Not run`",
  "- Exceptions/non-applicable criteria with rationale and authority: `None recorded`",
  "- Accessibility statement and known-limitations update: `Not run`",
  "- Evidence personal-data, credentials and confidential-content review: `Not run`",
  "- External auditor approval/date: `Not approved`",
  "- Accessibility owner approval/date: `Not approved`",
  "- Product approval/date: `Not approved`",
  "- Security/Privacy approval/date: `Not approved`",
];

function validatePendingAudit(candidate) {
  for (const sentinel of pendingAuditSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `WCAG audit record no longer proves pending state: ${sentinel}`,
    );
}

validatePendingAudit(auditRecord);
for (const sentinel of pendingAuditSentinels)
  assert.throws(() =>
    validatePendingAudit(
      auditRecord.replace(sentinel, "[prematurely changed]"),
    ),
  );
assert.ok(manualMatrix.includes("templates/wcag-audit-remediation-record.md"));
assert.ok(
  handover.includes("../quality/templates/wcag-audit-remediation-record.md"),
);

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
  `All ${count} public main-content targets receive programmatic focus; the non-focusable fixture, ${manualEvidenceSentinels.length} manual AT and ${pendingAuditSentinels.length} external-audit pending-state mutations failed closed.\n`,
);
