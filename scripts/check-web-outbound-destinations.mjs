import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const apiRoot = "apps/web/src/app/api";

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(path);
      return entry.isFile() && entry.name === "route.ts" ? [path] : [];
    }),
  );
  return nested.flat();
}

function preservesDestination(source) {
  const fetches = source.match(/\bfetch\s*\(/gu) ?? [];
  const redirectGuards = source.match(/redirect:\s*"error"/gu) ?? [];
  return fetches.length > 0 && redirectGuards.length === fetches.length;
}

const outboundRoutes = [];
for (const path of await routeFiles(apiRoot)) {
  const source = await readFile(path, "utf8");
  if (!source.includes("fetch(")) continue;
  outboundRoutes.push({ path, source });
}

assert.equal(
  outboundRoutes.length,
  9,
  "The public Web outbound-route inventory changed; review the new or removed destination boundary",
);

for (const { path, source } of outboundRoutes) {
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
  `All ${outboundRoutes.length} public Web outbound routes reject redirects; removal fixtures failed closed.\n`,
);
