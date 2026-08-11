import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const templates = new Map([
  [
    "uat-report.md",
    ["## Defects", "## Enhancement requests", "Release candidate ID"],
  ],
  [
    "beta-report.md",
    [
      "## Entry controls",
      "## Incidents, defects and enhancements",
      "Exact promoted release/digests",
    ],
  ],
  [
    "production-launch-record.md",
    [
      "## Content freeze and entry approvals",
      "## Monitoring and rollback watch",
      "Web/Admin/API image digests",
    ],
  ],
  [
    "acceptance-certificate.md",
    [
      "## Exceptions and residual obligations",
      "## Acceptance decision",
      "Production release ID",
    ],
  ],
  [
    "hypercare-report.md",
    [
      "## Incidents",
      "## Defects",
      "## Enhancements",
      "## Exit and support transition",
    ],
  ],
  [
    "project-closure-record.md",
    [
      "## Preconditions",
      "## Evidence archive",
      "## Closure decision and signatures",
    ],
  ],
]);

for (const [file, required] of templates) {
  const content = await readFile(`docs/operations/templates/${file}`, "utf8");
  for (const phrase of required)
    assert.ok(
      content.includes(phrase),
      `${file} lost required section ${phrase}`,
    );
  assert.match(
    content,
    /Not (?:run|approved|signed|recorded|assigned|scheduled)/u,
  );
  assert.doesNotMatch(content, /Status:\s*(?:Complete|Approved|Passed)/iu);
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
  "Release acceptance package preserves 6 controlled, honestly unexecuted evidence records.\n",
);
