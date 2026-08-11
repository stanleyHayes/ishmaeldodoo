import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const webRoot = path.join(projectRoot, "apps", "web");
const port = 3199;
const origin = `http://127.0.0.1:${port}`;
const budgetBytes = 200 * 1024;
const baseRoutes = [
  "/",
  "/record",
  "/record/atlas/table",
  "/record/sources",
  "/speaking",
  "/speaking/request",
  "/signals",
  "/press",
  "/press/contact",
  "/doctrine",
  "/archive",
  "/legacy",
  "/office-hours",
  "/selah",
  "/contact",
  "/legal/privacy",
  "/legal/terms",
  "/legal/disclosure",
];
const routes = [
  ...baseRoutes,
  ...baseRoutes.map((route) => (route === "/" ? "/fr" : `/fr${route}`)),
].map((route) => `${route}?lite=1`);

function staticAssetPaths(html) {
  const paths = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"#?]+)"/gu)) {
    const asset = match[1];
    if (asset?.startsWith("/_next/static/")) {
      paths.add(asset);
    }
  }
  return [...paths];
}

async function compressedRouteBytes(route) {
  const response = await fetch(`${origin}${route}`);
  if (!response.ok) throw new Error(`${route} returned ${response.status}`);
  const html = await response.text();
  let total = gzipSync(Buffer.from(html)).byteLength;
  const assets = staticAssetPaths(html);
  for (const asset of assets) {
    const file = path.join(webRoot, ".next", asset.replace("/_next/", ""));
    total += gzipSync(await readFile(file)).byteLength;
  }
  return { total, assets: assets.length };
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/robots.txt`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Production web server did not become ready");
}

const server = spawn(
  process.execPath,
  [
    path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"),
    "start",
    "--port",
    String(port),
  ],
  {
    cwd: webRoot,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError += String(chunk);
});

try {
  await waitUntilReady();
  let failed = false;
  for (const route of routes) {
    const { total, assets } = await compressedRouteBytes(route);
    const kib = (total / 1024).toFixed(1);
    process.stdout.write(
      `Sahel budget ${route}: ${kib} KiB compressed (${assets} static assets)\n`,
    );
    if (total > budgetBytes) failed = true;
  }
  if (failed)
    throw new Error(
      `Sahel route exceeds the ${budgetBytes / 1024} KiB compressed budget`,
    );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  server.kill("SIGTERM");
}
