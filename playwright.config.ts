import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { e2eMfaKey, e2eMongoUri, e2eRoomMongoUri } from "./e2e/auth-fixture";

const jwtKeys = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const tlsCertificate = readFileSync("tmp/e2e-tls/localhost-cert.pem", "utf8");
const tlsPrivateKey = readFileSync("tmp/e2e-tls/localhost-key.pem", "utf8");
const publicServiceKeyId = "web-e2e";
const publicServiceSecret = "e2e-public-service-secret-at-least-32-bytes";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Stateful auth/Desk journeys share one disposable replica and development
  // server set. Serial execution prevents cross-project rate/state contention;
  // parallelism belongs at the isolated job/environment level.
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "node scripts/start-next-e2e.mjs web 3210 https",
      url: "https://localhost:3210",
      reuseExistingServer: false,
      timeout: 120_000,
      ignoreHTTPSErrors: true,
      env: {
        PUBLIC_API_BASE_URL: "https://localhost:4210/v1",
        PUBLIC_WEB_BASE_URL: "https://localhost:3210",
        PUBLIC_SERVICE_KEY_ID: publicServiceKeyId,
        PUBLIC_SERVICE_SECRET: publicServiceSecret,
        PUBLIC_INDEXING_ENABLED: "false",
        NEXT_PUBLIC_ROOM_TRUST_ANCHOR_KEY_ID:
          process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_KEY_ID!,
        NEXT_PUBLIC_ROOM_TRUST_ANCHOR_PUBLIC_KEY:
          process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_PUBLIC_KEY!,
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      },
    },
    {
      command: "node scripts/start-next-e2e.mjs admin 3211 https",
      url: "https://localhost:3211",
      reuseExistingServer: false,
      timeout: 120_000,
      ignoreHTTPSErrors: true,
      env: { NEXT_PUBLIC_API_BASE_URL: "https://localhost:4210/v1" },
    },
    {
      command: "npm run start --workspace @amanor/api",
      url: "https://localhost:4210/v1/health/ready",
      reuseExistingServer: false,
      timeout: 120_000,
      ignoreHTTPSErrors: true,
      env: {
        NODE_ENV: "test",
        PORT: "4210",
        ADMIN_ORIGIN: "https://localhost:3211",
        WEBAUTHN_ENABLED: "true",
        WEBAUTHN_RP_ID: "localhost",
        WEBAUTHN_RP_NAME: "Project AMANOR Admin E2E",
        WEBAUTHN_ORIGIN: "https://localhost:3211",
        PUBLIC_WEB_ORIGIN: "https://localhost:3210",
        PUBLIC_WEB_SERVICE_KEYS: JSON.stringify({
          [publicServiceKeyId]: publicServiceSecret,
        }),
        ROOM_ENABLED: "true",
        ROOM_MONGODB_URI: e2eRoomMongoUri,
        ROOM_TRUST_ANCHOR_KEY_ID:
          process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_KEY_ID!,
        ROOM_TRUST_ANCHOR_PUBLIC_KEY:
          process.env.NEXT_PUBLIC_ROOM_TRUST_ANCHOR_PUBLIC_KEY!,
        ROOM_REQUIRED_AMR: "pwd,totp",
        MONGODB_URI: e2eMongoUri,
        JWT_ISSUER: "https://localhost:4210",
        JWT_AUDIENCE: "amanor-admin-e2e",
        JWT_KEY_ID: "e2e-key",
        JWT_PRIVATE_KEY_PEM: jwtKeys.privateKey,
        JWT_PUBLIC_KEY_PEM: jwtKeys.publicKey,
        JWT_VERIFICATION_KEYS: JSON.stringify({
          "e2e-key": jwtKeys.publicKey,
        }),
        SESSION_PEPPER: "e2e-session-pepper-at-least-thirty-two-bytes",
        MFA_ENCRYPTION_KEY: e2eMfaKey,
        RATE_LIMIT_PEPPER: "e2e-rate-limit-pepper-at-least-thirty-two-bytes",
        API_TLS_PRIVATE_KEY_PEM: tlsPrivateKey,
        API_TLS_CERTIFICATE_PEM: tlsCertificate,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: /device-network\.spec\.ts/u,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testIgnore: /device-network\.spec\.ts/u,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testIgnore: /device-network\.spec\.ts/u,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "android-emulated-3g",
      testMatch: /device-network\.spec\.ts/u,
      use: {
        ...devices["Pixel 5"],
        locale: "en-GB",
      },
    },
    {
      name: "android-emulated-2g",
      testMatch: /device-network\.spec\.ts/u,
      use: {
        ...devices["Pixel 5"],
        locale: "en-GB",
      },
    },
  ],
});
