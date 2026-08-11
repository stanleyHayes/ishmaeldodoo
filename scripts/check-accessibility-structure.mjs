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

process.stdout.write(
  `All ${count} public main-content targets receive programmatic focus; the non-focusable fixture failed closed.\n`,
);
