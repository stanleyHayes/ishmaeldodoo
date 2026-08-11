import { spawnSync } from "node:child_process";

function assertSecurityHeaders(response, label) {
  const csp = response.headers.get("content-security-policy") ?? "";
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ]) {
    if (!csp.includes(directive))
      throw new Error(`${label} CSP is missing ${directive}`);
  }
  if (csp.includes("'unsafe-eval'"))
    throw new Error(`${label} production CSP permits unsafe-eval`);
  for (const header of [
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "permissions-policy",
  ]) {
    if (!response.headers.has(header))
      throw new Error(`${label} is missing ${header}`);
  }
}

const apps = [
  {
    name: "web",
    port: 43210,
    internal: 3000,
    dockerfile: "apps/web/Dockerfile",
    cachePath: "/workspace/apps/web/.next/cache",
    buildArgs: [],
    check: async (response) => {
      assertSecurityHeaders(response, "Public web");
      const robots = await fetch("http://127.0.0.1:43210/robots.txt").then(
        (item) => item.text(),
      );
      if (!robots.includes("Disallow: /"))
        throw new Error("Public preview image must remain noindex");
    },
  },
  {
    name: "admin",
    port: 43211,
    internal: 3001,
    dockerfile: "apps/admin/Dockerfile",
    cachePath: "/workspace/apps/admin/.next/cache",
    buildArgs: [
      "--build-arg",
      "NEXT_PUBLIC_API_BASE_URL=https://api.example.test/v1",
      "--build-arg",
      "NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV=production",
    ],
    check: async (response) => {
      assertSecurityHeaders(response, "Admin");
      const html = await response.text();
      if (!/noindex|index":false/iu.test(html))
        throw new Error("Admin noindex metadata is missing");
      if (!response.headers.get("cache-control")?.includes("no-store"))
        throw new Error("Admin no-store header is missing");
    },
  },
];

const requestedApps = process.argv.slice(2);
const unknownApps = requestedApps.filter(
  (name) => !apps.some((app) => app.name === name),
);

if (unknownApps.length > 0) {
  throw new Error(`Unknown frontend app(s): ${unknownApps.join(", ")}`);
}

const selectedApps =
  requestedApps.length === 0
    ? apps
    : apps.filter((app) => requestedApps.includes(app.name));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  return String(result.stdout ?? "").trim();
}
for (const app of selectedApps) {
  const image = `amanor-${app.name}:verification`;
  const container = `amanor-${app.name}-verification`;
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  try {
    run(
      "docker",
      ["build", "-f", app.dockerfile, ...app.buildArgs, "-t", image, "."],
      { stdio: "inherit" },
    );
    run("docker", [
      "run",
      "-d",
      "--name",
      container,
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--tmpfs",
      `${app.cachePath}:rw,noexec,nosuid,size=128m,uid=1000,gid=1000`,
      "-p",
      `127.0.0.1:${app.port}:${app.internal}`,
      image,
    ]);
    const deadline = Date.now() + 45_000;
    let response;
    while (Date.now() < deadline) {
      try {
        response = await fetch(`http://127.0.0.1:${app.port}/`);
        if (response.ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (!response?.ok)
      throw new Error(
        `${app.name} did not become ready\n${run("docker", ["logs", container])}`,
      );
    await app.check(response);
    const uid = run("docker", ["exec", container, "id", "-u"]);
    if (uid === "0") throw new Error(`${app.name} runs as root`);
    const stoppingAt = Date.now();
    run("docker", ["stop", "--time", "10", container]);
    const elapsed = Date.now() - stoppingAt;
    const exit = run("docker", [
      "inspect",
      "--format",
      "{{.State.ExitCode}}",
      container,
    ]);
    if (!["0", "143"].includes(exit) || elapsed > 12_000)
      throw new Error(
        `${app.name} SIGTERM exit was ${exit} after ${elapsed}ms`,
      );
    process.stdout.write(
      `${app.name} container passed: HTTP, boundary headers, uid=${uid}, SIGTERM=${exit} in ${elapsed}ms\n`,
    );
  } finally {
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  }
}
