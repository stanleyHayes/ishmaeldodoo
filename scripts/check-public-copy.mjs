import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const repositoryRoot = process.cwd();
const productionRoots = [
  join(repositoryRoot, "apps/web/src"),
  join(repositoryRoot, "apps/admin/src"),
];
const supportedExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".json",
]);
const ignoredNamePattern = /(?:^|\.)(?:test|spec|stories)\.[^.]+$/u;

const canonicalValues = [
  {
    label: "canonical legal/display name",
    pattern: /(?:Dr\.\s+)?Ishmael\s+Nii\s+Amanor\s+Dodoo/iu,
  },
  {
    label: "canonical short display name",
    pattern: /Dr\.\s+Ishmael\s+Dodoo/iu,
  },
  {
    label: "canonical short name",
    pattern: /(?<!Dr\.\s)(?<!Dr\s)Ishmael\s+Dodoo/iu,
  },
  {
    label: "canonical familiar name",
    pattern: /Dr\.\s+Ish\b/iu,
  },
  {
    label: "canonical current title",
    pattern: /Chief\s+Partnerships?\s+Officer/iu,
  },
  {
    label: "canonical long-form title",
    pattern: /Director\s+and\s+Head\s+of\s+Innovative\s+Finance/iu,
  },
];

function isIgnored(path) {
  return (
    path.split(/[\\/]/u).some((part) => part === "__fixtures__") ||
    ignoredNamePattern.test(path)
  );
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".next", "dist"].includes(entry.name))
        files.push(...(await sourceFiles(path)));
    } else if (
      supportedExtensions.has(extname(entry.name)) &&
      !isIgnored(path)
    ) {
      files.push(path);
    }
  }
  return files;
}

export async function findViolations(roots) {
  const violations = [];
  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      const content = await readFile(file, "utf8");
      for (const rule of canonicalValues) {
        if (rule.pattern.test(content)) {
          violations.push(
            `${relative(repositoryRoot, file)}: hard-coded ${rule.label}; resolve it from the published identity registry`,
          );
        }
      }
    }
  }
  return violations;
}

async function verifyFixtures() {
  const fixtureRoot = join(
    repositoryRoot,
    "scripts/fixtures/public-copy-guard",
  );
  const allowed = await findViolations([join(fixtureRoot, "allowed")]);
  const rejected = await findViolations([join(fixtureRoot, "rejected")]);
  if (allowed.length !== 0)
    throw new Error(`Allowed fixture was rejected:\n${allowed.join("\n")}`);
  if (rejected.length !== canonicalValues.length) {
    throw new Error(
      `Rejected fixture should trigger ${canonicalValues.length} rules but triggered ${rejected.length}:\n${rejected.join("\n")}`,
    );
  }
  process.stdout.write("Public-copy guard fixtures passed.\n");
}

async function main() {
  if (process.argv.includes("--verify-fixtures")) await verifyFixtures();
  const rootArguments = process.argv.filter((argument) =>
    argument.startsWith("--root="),
  );
  const roots =
    rootArguments.length > 0
      ? rootArguments.map((argument) =>
          resolve(repositoryRoot, argument.slice("--root=".length)),
        )
      : productionRoots;
  const violations = await findViolations(roots);
  if (violations.length > 0) {
    process.stderr.write(`${violations.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Public canonical copy is CMS-resolved.\n");
  }
}

await main();
