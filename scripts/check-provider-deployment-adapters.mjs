import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const blueprint = parse(await readFile("render.yaml", "utf8"));
const apiDockerfile = await readFile("apps/api/Dockerfile", "utf8");
const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
const guide = await readFile(
  "docs/operations/render-vercel-deployment.md",
  "utf8",
);
const vercel = Object.fromEntries(
  await Promise.all(
    ["web", "admin"].map(async (name) => [
      name,
      JSON.parse(await readFile(`apps/${name}/vercel.json`, "utf8")),
    ]),
  ),
);

assert.equal(blueprint.services.length, 2);
const api = blueprint.services.find(({ name }) => name === "amanor-api");
const retention = blueprint.services.find(
  ({ name }) => name === "amanor-retention",
);
assert.ok(api && retention, "Render API and retention services are required");
for (const service of [api, retention])
  assert.equal(
    service.repo,
    "https://github.com/stanleyHayes/ishmaeldodoo",
    `${service.name} must bind to the canonical GitHub repository accepted by Render`,
  );
assert.deepEqual(
  {
    type: api.type,
    runtime: api.runtime,
    dockerContext: api.dockerContext,
    dockerfilePath: api.dockerfilePath,
    healthCheckPath: api.healthCheckPath,
    autoDeployTrigger: api.autoDeployTrigger,
  },
  {
    type: "web",
    runtime: "docker",
    dockerContext: ".",
    dockerfilePath: "./apps/api/Dockerfile",
    healthCheckPath: "/v1/health/ready",
    autoDeployTrigger: "off",
  },
);
assert.equal(api.maxShutdownDelaySeconds, 30);
assert.equal(retention.type, "cron");
assert.equal(retention.runtime, "docker");
assert.equal(retention.schedule, "17 2 * * *");
assert.equal(retention.dockerCommand, "node apps/api/dist/retention.js");

const envMap = (service) =>
  new Map(service.envVars.map((entry) => [entry.key, entry]));
const apiEnv = envMap(api);
const retentionEnv = envMap(retention);
for (const key of [
  "ADMIN_ORIGIN",
  "PUBLIC_WEB_ORIGIN",
  "MONGODB_URI",
  "JWT_PRIVATE_KEY_PEM",
  "JWT_VERIFICATION_KEYS",
  "CLOUDINARY_API_SECRET",
  "RESEND_API_KEY",
])
  assert.equal(
    apiEnv.get(key)?.sync,
    false,
    `${key} must be dashboard-supplied`,
  );
for (const forbidden of [
  "MONGODB_MIGRATION_URI",
  "MONGODB_RETENTION_URI",
  "CLOUDINARY_RETENTION_API_KEY",
  "CLOUDINARY_RETENTION_API_SECRET",
])
  assert.ok(
    !apiEnv.has(forbidden),
    `${forbidden} must not enter the long-running API service`,
  );
assert.equal(apiEnv.get("RUN_MIGRATIONS")?.value, "false");
assert.equal(
  apiEnv.get("TRUST_PROXY_HOPS")?.value,
  "1",
  "Render public traffic must preserve exactly one trusted load-balancer hop",
);
assert.equal(apiEnv.get("ROOM_ENABLED")?.value, "false");
assert.equal(apiEnv.get("WEBAUTHN_ENABLED")?.value, "false");
assert.deepEqual(
  [...retentionEnv.keys()].sort(),
  [
    "CLOUDINARY_RETENTION_API_KEY",
    "CLOUDINARY_RETENTION_API_SECRET",
    "CLOUDINARY_RETENTION_CLOUD_NAME",
    "MONGODB_RETENTION_URI",
    "NODE_ENV",
  ].sort(),
);
assert.ok(
  apiDockerfile.includes("apt-get install -y --no-install-recommends chromium"),
);
assert.equal(
  rootPackage.engines?.node,
  ">=24.0.0 <27.0.0",
  "The workspace must support Vercel Node 24 and pinned Node 26 containers without admitting unknown future majors",
);
assert.equal(
  guide.match(/Node\.js: 24\.x/gu)?.length,
  2,
  "Both independent Vercel projects must select the newest supported Node 24 runtime",
);

for (const [name, config] of Object.entries(vercel)) {
  assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json");
  assert.equal(config.framework, "nextjs");
  assert.equal(config.installCommand, "npm ci");
  assert.equal(
    config.buildCommand,
    `npm run build --workspace @amanor/contracts && npm run build --workspace @amanor/${name}`,
  );
  assert.ok(!("env" in config), `${name} vercel.json must not contain values`);
  assert.ok(
    !("outputDirectory" in config),
    `${name} must use Vercel's native Next.js output`,
  );
}

for (const phrase of [
  "Root Directory: `apps/web`",
  "Root Directory: `apps/admin`",
  "Include source files outside the Root Directory",
  "MONGODB_MIGRATION_URI",
  "Render API service remains manually promoted",
  "Deployment Protection",
  "Cloudinary uploads originate from local files",
  "31 varied spoofed `X-Forwarded-For` values",
])
  assert.ok(guide.includes(phrase), `Deployment guide is missing: ${phrase}`);

process.stdout.write(
  "Render API/retention and independent Vercel Web/Admin adapters preserve deployment and secret boundaries.\n",
);
