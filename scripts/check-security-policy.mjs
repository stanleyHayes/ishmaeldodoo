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
  /loopback local development/u,
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
const securityAssessmentRecord = await readFile(
  new URL(
    "../docs/security/templates/independent-security-assessment-record.md",
    import.meta.url,
  ),
  "utf8",
);
const automatedScanning = await readFile(
  new URL("../docs/security/automated-scanning.md", import.meta.url),
  "utf8",
);
const roomOperations = await readFile(
  new URL("../docs/security/room-operations.md", import.meta.url),
  "utf8",
);
const handover = await readFile(
  new URL("../docs/handover/README.md", import.meta.url),
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

const pendingAssessmentSentinels = [
  "- Status: `Not commissioned`",
  "- Assessor organisation, lead and independence declaration: `Not assigned`",
  "- Rules of engagement, authorization and emergency contacts: `Not recorded`",
  "- Production-like environment, release and Web/Admin/API revisions: `Not recorded`",
  "- Test window and final-report immutable evidence location: `Not scheduled`",
  "- Public Web, same-origin proxies and external egress scope: `Not run`",
  "- Admin/CMS authentication, JWT, cookies, CSRF, MFA/WebAuthn and recovery scope: `Not run`",
  "- Content/media publication, preview, rollback and audit scope: `Not run`",
  "- Protocol Desk intake, operator lifecycle, correspondence and decision links: `Not run`",
  "- Contact, Press Kit, media enquiry and generated-download scope: `Not run`",
  "- The Room enabled configuration, crypto flows and restricted client scope: `Not run`",
  "- Mongo application/migration/retention/Room identity and backup boundaries: `Not run`",
  "- Cloudinary, email, calendar, analytics, tile and revalidation integrations: `Not run`",
  "- Render/Vercel, DNS/TLS, CDN/WAF, IAM, secrets and network configuration: `Not run`",
  "- Authenticated DAST and manual business-logic test evidence: `Not run`",
  "- Cryptographic/threat-model review reference and disposition: `Not recorded`",
  "- Critical findings opened/closed/retested: `0 / 0 / 0`",
  "- High findings opened/closed/retested: `0 / 0 / 0`",
  "- Medium findings opened/closed/retested: `0 / 0 / 0`",
  "- Low findings opened/closed/retested: `0 / 0 / 0`",
  "- Finding IDs, affected revisions, owners, target dates and fixes: `None recorded`",
  "- Independent retest and zero-open-critical/high result: `Not run`",
  "- Accepted lower-risk findings with authority, rationale and expiry: `None recorded`",
  "- Test accounts/data, temporary access and provider artifacts cleaned up: `Not run`",
  "- Credentials, tokens, Room content and personal-data non-disclosure review: `Not run`",
  "- External assessor approval/date: `Not approved`",
  "- Security owner approval/date: `Not approved`",
  "- Privacy/Legal approval/date: `Not approved`",
  "- Product/Principal approval/date: `Not approved`",
];

function validatePendingAssessment(candidate) {
  for (const sentinel of pendingAssessmentSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Security assessment no longer proves pending state: ${sentinel}`,
    );
}

validatePendingAssessment(securityAssessmentRecord);
for (const sentinel of pendingAssessmentSentinels)
  assert.throws(() =>
    validatePendingAssessment(
      securityAssessmentRecord.replace(sentinel, "[prematurely changed]"),
    ),
  );
const assessmentLink = "templates/independent-security-assessment-record.md";
assert.ok(automatedScanning.includes(assessmentLink));
assert.ok(roomOperations.includes(assessmentLink));
assert.ok(
  handover.includes(
    "../security/templates/independent-security-assessment-record.md",
  ),
);

console.log(
  `Security headers, CSP origins, API hardening, privileged-read audit and abuse controls are internally consistent; ${pendingAssessmentSentinels.length} independent-assessment pending-state mutations fail closed.`,
);
