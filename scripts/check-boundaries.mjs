import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const frontendRoots = [join(root, "apps/web"), join(root, "apps/admin")];
const rules = [
  {
    id: "mongoose",
    pattern:
      /(?:from\s+|import\s*\(|require\s*\()\s*["']mongoose["']|["']mongoose["']\s*:/u,
    reason: "Mongoose is API-only",
  },
  {
    id: "mongodb",
    pattern:
      /(?:from\s+|import\s*\(|require\s*\()\s*["']mongodb["']|["']mongodb["']\s*:/u,
    reason: "MongoDB drivers are API-only",
  },
  { id: "nestjs", pattern: /@nestjs\//u, reason: "NestJS is API-only" },
  {
    id: "api-source",
    pattern:
      /(?:apps\/api|\.\.\/)+(?:src\/)?(?:modules|platform|common|config)|api\/src/u,
    reason: "frontends cannot import API source or repositories",
  },
  {
    id: "provider-sdk",
    pattern:
      /(?:from\s+|import\s*\(|require\s*\()\s*["']cloudinary["']|["']cloudinary["']\s*:/u,
    reason: "provider administration SDKs are API-only",
  },
  {
    id: "backend-secret",
    pattern:
      /MONGODB_(?:URI|MIGRATION_URI)|CLOUDINARY_API_SECRET|JWT_PRIVATE_KEY_PEM|SESSION_PEPPER|MFA_ENCRYPTION_KEY|RATE_LIMIT_PEPPER|RESEND_API_KEY/u,
    reason: "backend secrets are API-only",
  },
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".next", "dist"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (
      [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"].includes(
        extname(entry.name),
      )
    )
      files.push(path);
  }
  return files;
}

async function violationsFor(files) {
  const violations = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const rule of rules)
      if (rule.pattern.test(content)) violations.push({ file, rule });
  }
  return violations;
}

const violations = await violationsFor(
  (await Promise.all(frontendRoots.map(sourceFiles))).flat(),
);
if (violations.length > 0) {
  process.stderr.write(
    `${violations.map(({ file, rule }) => `${relative(root, file)}: ${rule.reason}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else if (process.argv.includes("--verify-fixtures")) {
  const fixtureRoot = join(root, "scripts/fixtures/boundaries");
  const fixtureViolations = await violationsFor(await sourceFiles(fixtureRoot));
  const caught = new Set(fixtureViolations.map(({ rule }) => rule.id));
  const missing = rules.filter((rule) => !caught.has(rule.id));
  if (missing.length > 0) {
    process.stderr.write(
      `Boundary negative fixtures did not exercise: ${missing.map((rule) => rule.id).join(", ")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Frontend/backend dependency boundaries passed; ${rules.length} prohibited classes rejected by fixtures.\n`,
    );
  }
} else {
  process.stdout.write("Frontend/backend dependency boundaries passed.\n");
}
