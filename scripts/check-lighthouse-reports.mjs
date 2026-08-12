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
const reportsPerRoute = 3;
const routeCounts = new Map([...expectedRoutes].map((route) => [route, 0]));

if (manifest.length !== expectedRoutes.size * reportsPerRoute) {
  throw new Error(
    `Expected ${reportsPerRoute} Lighthouse reports for each of ${expectedRoutes.size} routes`,
  );
}

for (const entry of manifest) {
  const currentCount = routeCounts.get(entry.url);
  if (currentCount === undefined) {
    throw new Error(`Unexpected Lighthouse route: ${entry.url}`);
  }
  routeCounts.set(entry.url, currentCount + 1);
  const report = JSON.parse(await readFile(entry.jsonPath, "utf8"));
  const script = report.audits["resource-summary"].details.items.find(
    (item) => item.resourceType === "script",
  );
  const isAtlas = new URL(entry.url).pathname.startsWith("/record/atlas");
  const isLite = new URL(entry.url).searchParams.get("lite") === "1";
  const checks = {
    accessibility: report.categories.accessibility.score === 1,
    lcp: report.audits["largest-contentful-paint"].numericValue <= 1_800,
    cls: report.audits["cumulative-layout-shift"].numericValue <= 0.05,
    initialScript: isAtlas || script?.transferSize <= 120 * 1_024,
    total:
      report.audits["total-byte-weight"].numericValue <=
      (isLite ? 200 : 500) * 1_024,
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

for (const [route, count] of routeCounts) {
  if (count !== reportsPerRoute) {
    throw new Error(
      `Expected ${reportsPerRoute} Lighthouse reports for ${route}; received ${count}`,
    );
  }
}

console.log(
  "Lighthouse reports meet accessibility 100, LCP 1.8 s and CLS 0.05; Lite reports stay within 200 KiB, non-Atlas scripts within 120 KiB, and the interactive Atlas within 500 KiB and 2.5 s TTI.",
);
