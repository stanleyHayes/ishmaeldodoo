import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".lighthouseci",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
  "tmp",
]);
const scannableExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const signatures = [
  ["private key", /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/u],
  ["GitHub token", /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{36,255}\b/u],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/u],
  ["live Stripe secret", /\bsk_live_[0-9A-Za-z]{20,}\b/u],
  ["Resend API key", /\bre_[0-9A-Za-z]{24,}\b/u],
  ["Cloudinary credential URL", /cloudinary:\/\/[0-9]+:[^\s@]{12,}@[^\s/]+/u],
];

async function files(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else if (entry.isFile() && scannableExtensions.has(extname(entry.name)))
      found.push(path);
  }
  return found;
}

function findings(source, path) {
  return signatures.flatMap(([label, pattern]) =>
    pattern.test(source) ? [`${path}: ${label}`] : [],
  );
}

if (process.argv.includes("--verify-fixtures")) {
  for (const [label, pattern] of signatures) {
    const value = {
      "private key": "-----BEGIN PRIVATE KEY-----",
      "AWS access key": "AKIA1234567890ABCDEF",
      "GitHub token": `ghp_${"a".repeat(36)}`,
      "Google API key": `AIza${"a".repeat(35)}`,
      "live Stripe secret": `sk_live_${"a".repeat(24)}`,
      "Resend API key": `re_${"a".repeat(24)}`,
      "Cloudinary credential URL":
        "cloudinary://12345:abcdefghijklmnop@cloud.example",
    }[label];
    assert.ok(
      value && pattern.test(value),
      `Fixture did not exercise ${label}`,
    );
  }
}

/**
 * This gate is about secrets that could reach the repository, so it must scan
 * what git would carry and nothing else. A developer's real `apps/api/.env`
 * holds a genuine private key by design and is git-ignored precisely so it can
 * never be committed; flagging it made `npm run check` unrunnable for anyone
 * with a working local environment, which teaches people to skip the gate.
 *
 * Falls back to scanning everything when git is unavailable, so a tarball or a
 * container without git history still fails closed rather than silently passing.
 */
function gitIgnoredPaths(candidates) {
  if (candidates.length === 0) return new Set();
  const result = spawnSync(
    "git",
    ["check-ignore", "--stdin", "-z", "--no-index"],
    {
      cwd: root,
      input: `${candidates.join("\0")}\0`,
      encoding: "utf8",
    },
  );
  // 0 = some paths ignored, 1 = none ignored. Anything else means git could not
  // answer, and we keep every candidate rather than assume it is safe.
  if (result.status !== 0 && result.status !== 1) return new Set();
  return new Set(result.stdout.split("\0").filter(Boolean));
}

const scanned = (await files(root)).map((path) => relative(root, path));
const ignored = gitIgnoredPaths(scanned);
const violations = [];
for (const path of scanned) {
  if (path === "scripts/check-secrets.mjs" || ignored.has(path)) continue;
  violations.push(...findings(await readFile(join(root, path), "utf8"), path));
}
if (violations.length > 0)
  throw new Error(
    `Potential committed secrets detected:\n${violations.join("\n")}`,
  );
console.log(
  `Committed-secret scan passed; ${signatures.length} signature classes enforced.`,
);
