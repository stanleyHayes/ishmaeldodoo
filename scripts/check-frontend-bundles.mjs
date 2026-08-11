import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const forbiddenPackages = [
  "mongoose",
  "mongodb",
  "cloudinary",
  "@nestjs/common",
  "@nestjs/core",
  "@nestjs/mongoose",
];
const forbiddenIdentifiers =
  /MONGODB_(?:URI|MIGRATION_URI)|CLOUDINARY_API_SECRET|JWT_PRIVATE_KEY_PEM|SESSION_PEPPER|MFA_ENCRYPTION_KEY|RATE_LIMIT_PEPPER|RESEND_API_KEY|apps\/api\/src/u;

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if ([".js", ".cjs", ".mjs", ".json"].includes(extname(entry.name)))
      result.push(path);
  }
  return result;
}

const violations = [];
for (const app of ["web", "admin"]) {
  const standalone = join(root, "apps", app, ".next", "standalone");
  if (!(await exists(standalone)))
    throw new Error(
      `${app} standalone build is missing; run its production build first`,
    );
  for (const packageName of forbiddenPackages) {
    if (
      await exists(
        join(standalone, "node_modules", packageName, "package.json"),
      )
    )
      violations.push(`${app}: forbidden runtime package ${packageName}`);
  }
  for (const file of await files(standalone)) {
    if (forbiddenIdentifiers.test(await readFile(file, "utf8")))
      violations.push(
        `${relative(root, file)}: backend secret or API-source identifier leaked`,
      );
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Frontend standalone bundles contain no API-only packages or backend-secret identifiers.\n",
  );
}
