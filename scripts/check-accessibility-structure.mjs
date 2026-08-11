import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

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

const files = execFileSync(
  "rg",
  [
    "-l",
    'id="main-content"',
    "apps/web/src",
    "--glob",
    "*.tsx",
    "--glob",
    "!*.test.tsx",
  ],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
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
