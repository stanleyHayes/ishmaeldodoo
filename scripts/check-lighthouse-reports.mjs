import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(".lighthouseci/manifest.json", "utf8"),
);
const expectedRoutes = new Set([
  "http://localhost:3310/?lite=1",
  "http://localhost:3310/record/atlas",
  "http://localhost:3310/record/atlas/table?lite=1",
  "http://localhost:3310/press?lite=1",
]);

if (manifest.length !== expectedRoutes.size) {
  throw new Error(`Expected ${expectedRoutes.size} Lighthouse reports`);
}

for (const entry of manifest) {
  if (!expectedRoutes.delete(entry.url)) {
    throw new Error(`Unexpected Lighthouse route: ${entry.url}`);
  }
  const report = JSON.parse(await readFile(entry.jsonPath, "utf8"));
  const script = report.audits["resource-summary"].details.items.find(
    (item) => item.resourceType === "script",
  );
  const isAtlas = new URL(entry.url).pathname.startsWith("/record/atlas");
  const isSahel = new URL(entry.url).searchParams.get("lite") === "1";
  const checks = {
    accessibility: report.categories.accessibility.score === 1,
    lcp: report.audits["largest-contentful-paint"].numericValue <= 1_800,
    cls: report.audits["cumulative-layout-shift"].numericValue <= 0.05,
    initialScript: isAtlas || script?.transferSize <= 120 * 1_024,
    total:
      report.audits["total-byte-weight"].numericValue <=
      (isSahel ? 200 : 500) * 1_024,
    atlasInteractive:
      !isAtlas || report.audits.interactive.numericValue <= 2_500,
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length) {
    throw new Error(
      `${entry.url} failed Lighthouse DoD checks: ${failed.join(", ")}; script=${script?.transferSize ?? "missing"} bytes`,
    );
  }
}

console.log(
  "Lighthouse reports meet accessibility 100, LCP 1.8 s and CLS 0.05; Sahel reports stay within 200 KiB, non-Atlas scripts within 120 KiB, and the interactive Atlas within 500 KiB and 2.5 s TTI.",
);
