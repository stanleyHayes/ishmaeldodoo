import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { acquireFixtureLock, releaseFixtureLock } from "./lib/fixture-lock.mjs";

const compose = ["compose", "-f", "infra/docker-compose.test.yml"];
const certificateDirectory = "tmp/e2e-tls";
const certificatePath = `${certificateDirectory}/localhost-cert.pem`;
const privateKeyPath = `${certificateDirectory}/localhost-key.pem`;

function decodeBase64Url(value) {
  return Buffer.from(value.replace(/-/gu, "+").replace(/_/gu, "/"), "base64");
}

function rawPublicKey(jwk) {
  if (!jwk.x || !jwk.y) throw new Error("The E2E P-256 key is incomplete");
  return Buffer.concat([
    Buffer.from([4]),
    decodeBase64Url(jwk.x),
    decodeBase64Url(jwk.y),
  ]).toString("base64url");
}

const trustAnchor = generateKeyPairSync("ec", { namedCurve: "P-256" });
const recipient = generateKeyPairSync("ec", { namedCurve: "P-256" });
const trustAnchorPrivateJwk = trustAnchor.privateKey.export({ format: "jwk" });
const trustAnchorPublicJwk = trustAnchor.publicKey.export({ format: "jwk" });
const recipientPrivateJwk = recipient.privateKey.export({ format: "jwk" });
const recipientPublicJwk = recipient.publicKey.export({ format: "jwk" });
const roomEnvironment = {
  E2E_ROOM_TRUST_ANCHOR_PRIVATE_JWK: JSON.stringify(trustAnchorPrivateJwk),
  E2E_ROOM_RECIPIENT_PRIVATE_JWK: JSON.stringify(recipientPrivateJwk),
  E2E_ROOM_RECIPIENT_PUBLIC_KEY: rawPublicKey(recipientPublicJwk),
  E2E_ROOM_TRUST_ANCHOR_PUBLIC_KEY: rawPublicKey(trustAnchorPublicJwk),
  NEXT_PUBLIC_ROOM_TRUST_ANCHOR_KEY_ID: "ta-e2e-2026",
  NEXT_PUBLIC_ROOM_TRUST_ANCHOR_PUBLIC_KEY: rawPublicKey(trustAnchorPublicJwk),
};

function run(command, arguments_, environment = process.env) {
  return spawnSync(command, arguments_, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
}

acquireFixtureLock("the browser suite");

mkdirSync(certificateDirectory, { recursive: true });
const certificate = spawnSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    privateKeyPath,
    "-out",
    certificatePath,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  { cwd: process.cwd(), env: process.env, stdio: "ignore" },
);
if (certificate.status !== 0) process.exit(certificate.status ?? 1);

// NEXT_PUBLIC_* values are compiled into Next.js browser bundles. Supplying
// them only to Playwright's webServer process leaves the production admin
// bundle unable to reach the disposable TLS API.
const built = run("npm", ["run", "build"], {
  ...process.env,
  ...roomEnvironment,
  NEXT_PUBLIC_API_BASE_URL: "https://localhost:4210/v1",
  PUBLIC_API_BASE_URL: "https://localhost:4210/v1",
  PUBLIC_WEB_BASE_URL: "https://localhost:3210",
  PUBLIC_INDEXING_ENABLED: "false",
});
if (built.status !== 0) {
  rmSync(certificateDirectory, { recursive: true, force: true });
  releaseFixtureLock();
  process.exit(built.status ?? 1);
}

// Start from a genuinely disposable fixture. A run killed before its teardown
// leaves the container up with the Room user already created, and the
// non-idempotent `createUser` below then aborts the whole suite with
// `User "amanor_room_e2e@amanor_room_e2e" already exists` — a confusing failure
// that has nothing to do with the code under test. The lock above guarantees no
// other run is using this fixture, so removing it here is safe.
run("docker", [...compose, "down", "--volumes"]);

const started = run("docker", [...compose, "up", "-d", "--wait"]);
if (started.status !== 0) {
  rmSync(certificateDirectory, { recursive: true, force: true });
  releaseFixtureLock();
  process.exit(started.status ?? 1);
}

const roomUser = run("docker", [
  ...compose,
  "exec",
  "-T",
  "mongo-test",
  "mongosh",
  "--quiet",
  "--username",
  "amanor_test_admin",
  "--password",
  "amanor_test_admin_password",
  "--authenticationDatabase",
  "admin",
  "--eval",
  'db.getSiblingDB("amanor_room_e2e").createUser({user:"amanor_room_e2e",pwd:"amanor_room_e2e_password",roles:[{role:"dbOwner",db:"amanor_room_e2e"}]})',
]);
if (roomUser.status !== 0) {
  run("docker", [...compose, "down", "--volumes"]);
  rmSync(certificateDirectory, { recursive: true, force: true });
  releaseFixtureLock();
  process.exit(roomUser.status ?? 1);
}

let status = 1;
try {
  const result = run(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    { ...process.env, ...roomEnvironment },
  );
  status = result.status ?? 1;
} finally {
  const stopped = run("docker", [...compose, "down", "--volumes"]);
  if (stopped.status !== 0 && status === 0) status = stopped.status ?? 1;
  rmSync(certificateDirectory, { recursive: true, force: true });
  releaseFixtureLock();
}
process.exit(status);
