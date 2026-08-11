import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adminSecurityHeaders } from "../apps/admin/security-headers.mjs";
import { publicSecurityHeaders } from "../apps/web/security-headers.mjs";

function headerMap(headers) {
  return new Map(headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

function verifyCommon(headers, label) {
  const values = headerMap(headers);
  for (const name of [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "permissions-policy",
  ])
    assert.ok(values.has(name), `${label} is missing ${name}`);

  const csp = values.get("content-security-policy");
  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ])
    assert.ok(csp.includes(directive), `${label} CSP is missing ${directive}`);
  assert.ok(!csp.includes("'unsafe-eval'"), `${label} CSP permits unsafe-eval`);

  const permissions = values.get("permissions-policy");
  for (const capability of [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "usb=()",
    "browsing-topics=()",
  ])
    assert.ok(
      permissions.includes(capability),
      `${label} permits ${capability}`,
    );
}

const publicProduction = headerMap(
  publicSecurityHeaders({
    AMANOR_DEPLOYMENT_ENV: "production",
    LEAFLET_TILE_URL: "https://tiles.amanor.test/{z}/{x}/{y}.png",
  }),
);
verifyCommon(
  [...publicProduction].map(([key, value]) => ({ key, value })),
  "public web",
);
assert.match(
  publicProduction.get("content-security-policy"),
  /img-src[^;]*https:\/\/tiles\.amanor\.test/u,
);
assert.match(
  publicProduction.get("content-security-policy"),
  /upgrade-insecure-requests/u,
);
assert.doesNotMatch(
  headerMap(publicSecurityHeaders({ AMANOR_DEPLOYMENT_ENV: "local" })).get(
    "content-security-policy",
  ),
  /upgrade-insecure-requests/u,
);
assert.match(
  headerMap(publicSecurityHeaders({ AMANOR_DEPLOYMENT_ENV: "local" })).get(
    "content-security-policy",
  ),
  /'unsafe-eval'/u,
);

const admin = adminSecurityHeaders({
  NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV: "production",
  NEXT_PUBLIC_API_BASE_URL: "https://api.amanor.test/v1",
});
verifyCommon(admin, "admin");
const adminValues = headerMap(admin);
assert.match(
  adminValues.get("content-security-policy"),
  /connect-src 'self' https:\/\/api\.amanor\.test/u,
);
assert.equal(adminValues.get("cache-control"), "private, no-store");
assert.throws(
  () =>
    adminSecurityHeaders({
      NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV: "production",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/v1",
    }),
  /non-loopback HTTPS API origin/u,
  "Admin production security headers must reject a loopback HTTP API origin",
);
assert.throws(
  () =>
    adminSecurityHeaders({
      NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV: "production",
      NEXT_PUBLIC_API_BASE_URL: "https://operator:secret@api.amanor.test/v1",
    }),
  /contains prohibited URL parts/u,
  "Admin security headers must reject credentials embedded in the public API URL",
);

const apiMain = await readFile(
  new URL("../apps/api/src/main.ts", import.meta.url),
  "utf8",
);
const appModule = await readFile(
  new URL("../apps/api/src/app.module.ts", import.meta.url),
  "utf8",
);
const privilegedReadAudit = await readFile(
  new URL(
    "../apps/api/src/common/privileged-read-audit.interceptor.ts",
    import.meta.url,
  ),
  "utf8",
);
const refreshRotation = await readFile(
  new URL(
    "../apps/api/src/modules/auth/application/rotate-session.ts",
    import.meta.url,
  ),
  "utf8",
);
const authRepository = await readFile(
  new URL(
    "../apps/api/src/modules/auth/persistence/auth.repository.ts",
    import.meta.url,
  ),
  "utf8",
);
const authNotificationWorker = await readFile(
  new URL(
    "../apps/api/src/modules/auth/application/auth-notification.worker.ts",
    import.meta.url,
  ),
  "utf8",
);
assert.ok(
  !authRepository.includes("$slice: -12") &&
    !authRepository.includes("consumedRefreshHashes"),
  "Refresh replay evidence must never be truncated inside the session document",
);
for (const required of [
  "wasRefreshHashConsumed",
  "refresh_token_consumptions",
  "transaction.withTransaction",
  "consumedHash",
])
  assert.ok(
    `${refreshRotation}\n${authRepository}`.includes(required),
    `Refresh replay ledger lost required invariant: ${required}`,
  );
for (const required of [
  "recoverWithCode",
  "replaceRecoveryCodesAndNotify",
  'collection("auth_notification_jobs")',
  'revokeReason: "mfa_recovery"',
  "transaction.withTransaction",
])
  assert.ok(
    authRepository.includes(required),
    `Recovery transaction lost required invariant: ${required}`,
  );
for (const required of [
  '"Idempotency-Key": job.notificationId',
  "account_recovered",
  "recovery_codes_rotated",
  'status: "failed"',
  "availableAt",
])
  assert.ok(
    authNotificationWorker.includes(required),
    `Recovery notification worker lost required invariant: ${required}`,
  );
for (const forbidden of ["recoveryCodeHashes", "passwordHash", "mfaCode"])
  assert.ok(
    !authNotificationWorker.includes(forbidden),
    `Recovery notification worker may not access ${forbidden}`,
  );
assert.match(
  appModule,
  /provide: APP_INTERCEPTOR[\s\S]*useClass: PrivilegedReadAuditInterceptor/u,
  "API must retain the global privileged-read audit interceptor",
);
for (const forbidden of [
  "originalUrl",
  "query",
  "body",
  "sessionId",
  "userAgent",
  "request.ip",
])
  assert.ok(
    !privilegedReadAudit.includes(forbidden),
    `Privileged-read audit may not capture ${forbidden}`,
  );
for (const required of [
  'request.method !== "GET"',
  'type: "privileged_data_read"',
  "context.getClass().name",
  "context.getHandler().name",
  "await this.repository.appendEvent",
])
  assert.ok(
    privilegedReadAudit.includes(required),
    `Privileged-read audit lost required invariant: ${required}`,
  );
assert.match(
  apiMain,
  /app\.use\(helmet\(\)\)/u,
  "API must retain Helmet defaults",
);
assert.match(
  apiMain,
  /app\.enableCors\(\{/u,
  "API must retain explicit CORS configuration",
);
assert.match(
  apiMain,
  /app\.set\("trust proxy", trustProxyHops\)/u,
  "API must retain explicit proxy trust",
);
assert.match(
  apiMain,
  /bodyParser: false/u,
  "API must disable the framework default body parser",
);
assert.match(
  apiMain,
  /configureRequestBodyLimits\(app\)/u,
  "API must install project-owned request body limits",
);
assert.match(
  apiMain,
  /new UnsafeInputPipe\(\)/u,
  "API must reject unsafe nested operator and prototype keys globally",
);

const guardedControllers = [
  ["auth/http/auth.controller.ts", "AuthRateLimitGuard"],
  ["press-kit/press-kit.controller.ts", "PressKitRateLimitGuard"],
  ["press-kit/living-dossier.controller.ts", "PressKitRateLimitGuard"],
  ["press-kit/media-enquiry.controller.ts", "PressKitRateLimitGuard"],
  ["contact/contact-enquiry.controller.ts", "ContactRateLimitGuard"],
  [
    "protocol-desk/http/protocol-desk.controller.ts",
    "ProtocolDeskRateLimitGuard",
  ],
];
for (const [path, guard] of guardedControllers) {
  const source = await readFile(
    new URL(`../apps/api/src/modules/${path}`, import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    new RegExp(`@UseGuards\\(${guard}\\)`, "u"),
    `${path} lost ${guard}`,
  );
}

const cmsController = await readFile(
  new URL(
    "../apps/api/src/modules/content/http/cms.controller.ts",
    import.meta.url,
  ),
  "utf8",
);
assert.match(
  cmsController,
  /@UseGuards\(AccessTokenGuard, AdminMutationOriginGuard\)/u,
  "CMS mutations must retain explicit trusted-origin enforcement",
);

const publicRateGuard = await readFile(
  new URL(
    "../apps/api/src/modules/press-kit/press-kit-rate-limit.guard.ts",
    import.meta.url,
  ),
  "utf8",
);
for (const namespace of [
  "press-kit-ip",
  "media-enquiry-ip",
  "living-dossier-ip",
]) {
  assert.ok(
    publicRateGuard.includes(`"${namespace}"`),
    `Missing isolated ${namespace} rate namespace`,
  );
}

console.log(
  "Security headers, CSP origins, API hardening, privileged-read audit and abuse controls are internally consistent.",
);
