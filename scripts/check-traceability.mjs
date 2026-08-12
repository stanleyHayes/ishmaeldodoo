import { access, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const matrixPath = path.join(
  repositoryRoot,
  "docs/quality/requirements-traceability.md",
);
const matrix = await readFile(matrixPath, "utf8");
const plan = await readFile(path.join(repositoryRoot, "agent_plan.md"), "utf8");
const openApi = JSON.parse(
  await readFile(
    path.join(repositoryRoot, "packages/contracts/openapi/amanor-v1.json"),
    "utf8",
  ),
);
const expected = [
  ...Array.from(
    { length: 13 },
    (_, index) => `P${String(index + 1).padStart(2, "0")}`,
  ),
  ...Array.from(
    { length: 15 },
    (_, index) => `F${String(index + 1).padStart(2, "0")}`,
  ),
];
const permittedStatuses = new Set([
  "VERIFIED",
  "PARTIAL",
  "FOUNDATION",
  "BLOCKED",
]);
const rows = new Map();

for (const line of matrix.split("\n")) {
  const match = line.match(/^\|\s*(P\d{2}|F\d{2})\s*\|\s*([A-Z]+)\s*\|/u);
  if (!match) continue;
  const [, id, status] = match;
  if (rows.has(id)) throw new Error(`Duplicate traceability row: ${id}`);
  if (!permittedStatuses.has(status))
    throw new Error(`Unsupported traceability status for ${id}: ${status}`);
  rows.set(id, { line, status });
}

for (const id of expected) {
  const row = rows.get(id);
  if (!row) throw new Error(`Missing traceability row: ${id}`);
  const columns = row.line
    .split("|")
    .slice(1, -1)
    .map((value) => value.trim());
  if (columns.length !== 5 || !columns[2] || !columns[4])
    throw new Error(`Incomplete traceability row: ${id}`);
  const evidencePaths = [...columns[3].matchAll(/`([^`]+)`/g)].map(
    (match) => match[1],
  );
  if (evidencePaths.length === 0)
    throw new Error(`No automated evidence path recorded for ${id}`);
  for (const evidencePath of evidencePaths)
    await access(path.join(repositoryRoot, evidencePath));
}

const unexpected = [...rows.keys()].filter((id) => !expected.includes(id));
if (unexpected.length > 0)
  throw new Error(`Unexpected traceability rows: ${unexpected.join(", ")}`);
if (rows.size !== expected.length)
  throw new Error(
    `Expected ${expected.length} traceability rows, found ${rows.size}`,
  );

function validateF12(line) {
  const columns = line
    .split("|")
    .slice(1, -1)
    .map((value) => value.trim());
  if (columns[1] !== "VERIFIED")
    throw new Error(
      "F12 cannot regress below VERIFIED while its complete engineering evidence remains",
    );
  for (const requirement of [
    "database-level localized transcript search",
    "timestamp context",
    "plain/journalistic/academic citation",
    "chapters",
    "source-linked correction log",
  ])
    if (!columns[2].includes(requirement))
      throw new Error(`F12 traceability is missing ${requirement}`);
  for (const evidence of [
    "apps/api/src/platform/mongo/mongo.integration.test.ts",
    "apps/web/src/components/content/archive-register.test.tsx",
    "apps/web/src/components/content/quotable-transcript.test.tsx",
    "e2e/public-platform.spec.ts",
  ])
    if (!columns[3].includes(`\`${evidence}\``))
      throw new Error(
        `F12 traceability is missing direct evidence: ${evidence}`,
      );
}

function columnsFor(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((value) => value.trim());
}

function validateRecordPrintEvidence() {
  const p02 = columnsFor(rows.get("P02").line);
  const f03 = columnsFor(rows.get("F03").line);
  if (!p02[2].includes("exactly two A4 pages"))
    throw new Error("P02 traceability is missing exact two-page print scope");
  if (!p02[3].includes("`e2e/record-print.spec.ts`"))
    throw new Error(
      "P02 traceability is missing direct browser print evidence",
    );
  if (p02[4].includes("print"))
    throw new Error(
      "P02 still records verified browser print scope as outstanding",
    );
  if (f03[1] !== "VERIFIED")
    throw new Error(
      "F03 cannot regress below VERIFIED while its complete engineering evidence remains",
    );
  for (const requirement of [
    "shared P01/P02/P03",
    "audience/URL preference",
    "currency-safe aggregation",
    "exactly two A4 pages",
  ])
    if (!f03[2].includes(requirement))
      throw new Error(`F03 traceability is missing ${requirement}`);
  for (const evidence of [
    "apps/web/src/components/content/two-ledgers.test.tsx",
    "e2e/record-print.spec.ts",
  ])
    if (!f03[3].includes(`\`${evidence}\``))
      throw new Error(
        `F03 traceability is missing direct evidence: ${evidence}`,
      );
}

function validateP01SignalEvidence(line) {
  const columns = columnsFor(line);
  for (const requirement of [
    "latest locale-specific published Signal",
    "source-linked 200-word excerpt",
    "dated stale-French disclosure",
    "fail-closed omission",
  ])
    if (!columns[2].includes(requirement))
      throw new Error(`P01 traceability is missing ${requirement}`);
  for (const evidence of [
    "apps/api/src/modules/content/http/public-signals.controller.test.ts",
    "apps/web/src/lib/content/public-signal-client.test.ts",
    "apps/web/src/components/content/adaptive-home.test.tsx",
  ])
    if (!columns[3].includes(`\`${evidence}\``))
      throw new Error(
        `P01 traceability is missing direct Signal evidence: ${evidence}`,
      );
  if (columns[4].includes("Signal projection"))
    throw new Error(
      "P01 still records the implemented latest Signal projection as outstanding",
    );
}

validateF12(rows.get("F12").line);
validateRecordPrintEvidence();
validateP01SignalEvidence(rows.get("P01").line);

function validateSignalBoard(id) {
  const columns = columnsFor(rows.get(id).line);
  if (columns[1] !== "PARTIAL")
    throw new Error(
      `${id} must remain PARTIAL until its external approvals exist`,
    );
  for (const requirement of [
    "Signal Board",
    "confidence",
    "change-my-mind",
    "watching",
  ])
    if (!columns[2].includes(requirement))
      throw new Error(`${id} traceability is missing ${requirement}`);
  for (const evidence of [
    "apps/api/src/modules/content/application/cms.service.test.ts",
    "apps/api/src/platform/mongo/mongo.integration.test.ts",
    "apps/web/src/components/content/signal-board.test.tsx",
  ])
    if (!columns[3].includes(`\`${evidence}\``))
      throw new Error(
        `${id} traceability is missing direct evidence: ${evidence}`,
      );
  if (
    !columns[4].includes("D02") ||
    !columns[4].includes("approved production Signals")
  )
    throw new Error(
      `${id} traceability is missing its external acceptance gates`,
    );
}

validateSignalBoard("P06");
validateSignalBoard("F06");

function validatePlanStatus(taskId, allowedStatuses) {
  const row = plan.split("\n").find((line) => line.startsWith(`| ${taskId} |`));
  if (!row) throw new Error(`Missing primary ledger row: ${taskId}`);
  const status = row.match(
    /`(BACKLOG|BLOCKED|IN PROGRESS|IN REVIEW|DONE)`/u,
  )?.[1];
  if (!status || !allowedStatuses.includes(status))
    throw new Error(
      `${taskId} status ${status ?? "missing"} contradicts implemented traceability evidence`,
    );
}

for (const taskId of ["AMANOR-056", "AMANOR-070", "AMANOR-072"])
  validatePlanStatus(taskId, ["IN REVIEW", "DONE"]);
validatePlanStatus("AMANOR-073", ["IN PROGRESS", "IN REVIEW", "DONE"]);
for (const taskId of ["AMANOR-060", "AMANOR-075"])
  validatePlanStatus(taskId, ["IN PROGRESS", "IN REVIEW", "DONE"]);

const operationCount = Object.values(openApi.paths ?? {}).reduce(
  (count, item) =>
    count +
    ["get", "post", "put", "patch", "delete"].filter(
      (method) => item && typeof item === "object" && method in item,
    ).length,
  0,
);
const currentApiRow = plan
  .split("\n")
  .find((line) => line.startsWith("| AMANOR-009 |"));
const currentMfaRow = plan
  .split("\n")
  .find((line) => line.startsWith("| AMANOR-116 |"));
if (!currentApiRow?.includes(`All ${operationCount} implemented v1 operations`))
  throw new Error(
    "AMANOR-009 does not match the canonical OpenAPI operation count",
  );
for (const evidence of ["WebAuthn", "`hwk` elevation", "`IN REVIEW`"])
  if (!currentMfaRow?.includes(evidence))
    throw new Error(
      `AMANOR-116 is missing current hardware-key evidence: ${evidence}`,
    );
for (const staleFixture of [
  rows.get("F12").line.replace("VERIFIED", "FOUNDATION"),
  rows
    .get("F12")
    .line.replace("source-linked correction log", "basic archive projection"),
]) {
  try {
    validateF12(staleFixture);
    throw new Error("F12 drift fixture unexpectedly passed");
  } catch (error) {
    if (error.message === "F12 drift fixture unexpectedly passed") throw error;
  }
}

for (const [id, staleFixture] of [
  ["P02", rows.get("P02").line.replace("exactly two A4 pages", "print view")],
  ["F03", rows.get("F03").line.replace("VERIFIED", "PARTIAL")],
]) {
  const original = rows.get(id);
  rows.set(id, { ...original, line: staleFixture });
  try {
    validateRecordPrintEvidence();
    throw new Error(`${id} print drift fixture unexpectedly passed`);
  } catch (error) {
    if (error.message === `${id} print drift fixture unexpectedly passed`)
      throw error;
  } finally {
    rows.set(id, original);
  }
}

for (const staleFixture of [
  rows
    .get("P01")
    .line.replace("dated stale-French disclosure", "undisclosed translation"),
  rows
    .get("P01")
    .line.replace(
      "`apps/web/src/components/content/adaptive-home.test.tsx`<br>",
      "",
    ),
]) {
  try {
    validateP01SignalEvidence(staleFixture);
    throw new Error("P01 Signal drift fixture unexpectedly passed");
  } catch (error) {
    if (error.message === "P01 Signal drift fixture unexpectedly passed")
      throw error;
  }
}

console.log(
  `Traceability matrix covers all ${rows.size} P01-P13 and F01-F15 requirements; P01 Signal, P02/F03 print and F12 complete-scope drift fixtures passed.`,
);
