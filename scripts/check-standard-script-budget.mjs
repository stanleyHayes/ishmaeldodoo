import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const webRoot = path.join(projectRoot, "apps", "web");
const port = 3200;
const origin = `http://127.0.0.1:${port}`;
const targetBytes = 120 * 1024;
const standardNonRegressionBytes = 145 * 1024;
const roomNonRegressionBytes = 215 * 1024;
const baseRoutes = [
  "/",
  "/record",
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
  "/contact/room",
  "/legal/privacy",
  "/legal/terms",
  "/legal/disclosure",
];
const routes = [
  ...baseRoutes,
  ...baseRoutes.map((route) => (route === "/" ? "/fr" : `/fr${route}`)),
];

function initialScriptPaths(html) {
  return [
    ...new Set(
      [...html.matchAll(/<script[^>]+src="([^"?]+)[^>]*>/gu)]
        .filter((match) => !/\snomodule(?:="")?/iu.test(match[0]))
        .map((match) => match[1])
        .filter(
          (asset) =>
            asset?.startsWith("/_next/static/") && asset.endsWith(".js"),
        ),
    ),
  ];
}

async function compressedInitialScriptBytes(route) {
  const response = await fetch(`${origin}${route}`);
  if (!response.ok) throw new Error(`${route} returned ${response.status}`);
  const paths = initialScriptPaths(await response.text());
  let total = 0;
  for (const asset of paths) {
    const file = path.join(webRoot, ".next", asset.replace("/_next/", ""));
    total += gzipSync(await readFile(file)).byteLength;
  }
  return { total, scripts: paths.length };
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${origin}/robots.txt`)).ok) return;
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
  let targetMisses = 0;
  for (const route of routes) {
    const { total, scripts } = await compressedInitialScriptBytes(route);
    const kib = (total / 1024).toFixed(1);
    process.stdout.write(
      `Standard script budget ${route}: ${kib} KiB compressed (${scripts} scripts)\n`,
    );
    if (total > targetBytes) targetMisses += 1;
    const ceiling = route.endsWith("/contact/room")
      ? roomNonRegressionBytes
      : standardNonRegressionBytes;
    if (total > ceiling) failed = true;
  }
  if (failed)
    throw new Error(
      `A non-Atlas route exceeds its interim JavaScript non-regression ceiling`,
    );
  process.stdout.write(
    `${targetMisses}/${routes.length} routes remain above the brief's 120 KiB target pending controlled decision D11; none exceeds the interim 145 KiB standard or 215 KiB encrypted-Room non-regression ceiling.\n`,
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  server.kill("SIGTERM");
}
