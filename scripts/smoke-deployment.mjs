import { pathToFileURL } from "node:url";

const securityHeaders = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
];

function normalizedOrigin(value, label, allowHttp) {
  const url = new URL(value);
  if (!allowHttp && url.protocol !== "https:")
    throw new Error(`${label} must use HTTPS`);
  return url.origin;
}

async function read(response, label) {
  if (!response.ok)
    throw new Error(`${label} returned HTTP ${response.status}`);
  return response.text();
}

export async function runDeploymentSmoke(configuration, fetchImpl = fetch) {
  const {
    environment,
    webUrl,
    adminUrl,
    apiUrl,
    edgeAuthorization,
    allowHttp = false,
  } = configuration;
  if (!new Set(["preview", "staging", "production"]).has(environment))
    throw new Error("Smoke environment must be preview, staging or production");
  const origins = {
    web: normalizedOrigin(webUrl, "Public web", allowHttp),
    admin: normalizedOrigin(adminUrl, "Admin", allowHttp),
    api: normalizedOrigin(apiUrl, "API", allowHttp),
  };
  if (new Set(Object.values(origins)).size !== 3)
    throw new Error("Web, Admin and API must use three distinct origins");
  if (environment !== "production" && !edgeAuthorization)
    throw new Error(`${environment} smoke requires edge authorisation`);
  const headers = edgeAuthorization
    ? { Authorization: edgeAuthorization }
    : undefined;
  const request = (origin, path) =>
    fetchImpl(new URL(path, origin), {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

  if (environment !== "production") {
    const unauthorised = await fetchImpl(new URL("/", origins.web), {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (unauthorised.ok)
      throw new Error(
        `${environment} public web is reachable without edge auth`,
      );
  }

  for (const path of ["/", "/fr", "/record/atlas/table"])
    await read(await request(origins.web, path), `Public web ${path}`);
  const webHome = await request(origins.web, "/");
  for (const header of securityHeaders)
    if (!webHome.headers.has(header))
      throw new Error(`Public web is missing ${header}`);
  const robots = await read(
    await request(origins.web, "/robots.txt"),
    "Public robots",
  );
  if (environment === "production") {
    if (robots.includes("Disallow: /"))
      throw new Error("Production public web is still globally noindex");
    await read(await request(origins.web, "/sitemap.xml"), "Public sitemap");
  } else if (!robots.includes("Disallow: /")) {
    throw new Error(`${environment} public web must remain globally noindex`);
  }

  const admin = await request(origins.admin, "/");
  const adminHtml = await read(admin, "Admin");
  for (const header of securityHeaders)
    if (!admin.headers.has(header))
      throw new Error(`Admin is missing ${header}`);
  if (!admin.headers.get("cache-control")?.includes("no-store"))
    throw new Error("Admin must return Cache-Control: no-store");
  if (!/noindex|index":false/iu.test(adminHtml))
    throw new Error("Admin must remain noindex in every environment");

  const live = await request(origins.api, "/v1/health/live");
  await read(live, "API liveness");
  const ready = await request(origins.api, "/v1/health/ready");
  const readyBody = JSON.parse(await read(ready, "API readiness"));
  if (readyBody.status !== "ok" || readyBody.service !== "amanor-api")
    throw new Error("API readiness did not report the expected service state");
  if (!live.headers.get("x-request-id") || !ready.headers.get("x-request-id"))
    throw new Error("API health responses must expose request correlation IDs");

  return {
    schemaVersion: 1,
    environment,
    checkedAt: new Date().toISOString(),
    origins,
    checks: {
      independentOrigins: "passed",
      protectedNonProduction: "passed",
      publicEnglishFrenchAtlas: "passed",
      indexingPolicy: "passed",
      frontendSecurityHeaders: "passed",
      adminNoStoreNoindex: "passed",
      apiLiveReadyCorrelation: "passed",
    },
  };
}

async function main() {
  const result = await runDeploymentSmoke({
    environment: process.env.AMANOR_SMOKE_ENVIRONMENT,
    webUrl: process.env.AMANOR_SMOKE_WEB_URL,
    adminUrl: process.env.AMANOR_SMOKE_ADMIN_URL,
    apiUrl: process.env.AMANOR_SMOKE_API_URL,
    edgeAuthorization: process.env.AMANOR_SMOKE_EDGE_AUTHORIZATION,
    allowHttp: process.env.AMANOR_SMOKE_ALLOW_HTTP_LOCAL === "true",
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
