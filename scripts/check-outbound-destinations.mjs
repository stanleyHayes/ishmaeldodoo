import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const roots = [
  "apps/web/src/app/api",
  "apps/web/src/lib",
  "apps/admin/src/lib",
  "apps/api/src",
];
const ignoredSourcePattern = /(?:^|\.)(?:test|spec)\.[^.]+$/u;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory())
        return entry.name === "__fixtures__" ? [] : sourceFiles(path);
      return entry.isFile() &&
        /\.(?:ts|tsx)$/u.test(entry.name) &&
        !ignoredSourcePattern.test(entry.name)
        ? [path]
        : [];
    }),
  );
  return nested.flat();
}

function preservesDestination(source) {
  const fetches = source.match(/\bfetch\s*\(/gu) ?? [];
  const redirectGuards = source.match(/redirect:\s*"error"/gu) ?? [];
  return fetches.length > 0 && redirectGuards.length === fetches.length;
}

const outboundSources = [];
const files = (await Promise.all(roots.map(sourceFiles))).flat();
for (const path of files) {
  const source = await readFile(path, "utf8");
  if (!source.includes("fetch(")) continue;
  outboundSources.push({ path, source });
}

const fetchCount = outboundSources.reduce(
  (total, { source }) => total + (source.match(/\bfetch\s*\(/gu) ?? []).length,
  0,
);
assert.equal(
  fetchCount,
  33,
  "The production outbound-fetch inventory changed; review the new or removed destination boundary",
);

for (const { path, source } of outboundSources) {
  const displayPath = relative(process.cwd(), path);
  assert.ok(
    preservesDestination(source),
    `${displayPath} must reject redirects for every outbound request`,
  );

  const unsafeFixture = source.replace(/redirect:\s*"error",?/u, "");
  assert.ok(
    !preservesDestination(unsafeFixture),
    `${displayPath} redirect-removal fixture did not fail closed`,
  );
}

process.stdout.write(
  `All ${fetchCount} Web, Admin and API outbound fetch sites reject redirects; removal fixtures failed closed.\n`,
);
