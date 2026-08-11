#!/usr/bin/env node
/**
 * Signs and publishes The Room's recipient key manifest.
 *
 * This is deliberately *not* an API route. The Room credential holds `find` and
 * nothing else on `room_key_manifests`, so a fully compromised API cannot
 * publish a recipient key or retire one. Publication is an out-of-band action
 * performed under dual control with a separate credential, as described in
 * `docs/security/room-key-custody-and-recovery.md`.
 *
 * Usage:
 *   node scripts/publish-room-manifest.mjs sign \
 *     --anchor-key <pkcs8.pem> --anchor-key-id ta-room-2026 \
 *     --key rk-principal-2026:3:<base64url-public-point> \
 *     [--key rk-designate-2026:1:<base64url-public-point>] \
 *     [--valid-days 30] > manifest.json
 *
 *   ROOM_MANIFEST_PUBLISHER_URI=mongodb://... \
 *   node scripts/publish-room-manifest.mjs publish \
 *     --manifest manifest.json --anchor-public <base64url-public-point> \
 *     --anchor-key-id ta-room-2026
 *
 * `publish` re-verifies the signature against the pinned anchor before writing,
 * so a corrupted or mis-signed file cannot take the channel down or point it at
 * an unverifiable key.
 */
import { readFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

const DAY = 24 * 60 * 60 * 1000;

function options(argv) {
  const parsed = { key: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    const value = argv[index + 1];
    if (name === "key") parsed.key.push(value);
    else parsed[name] = value;
    index += 1;
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** Mirrors `canonicalRoomKeyManifestPayload` in `@amanor/contracts`. */
function canonicalPayload(body) {
  return JSON.stringify([
    "amanor-room-manifest-v1",
    body.manifestVersion,
    body.issuedAt,
    body.expiresAt,
    body.keys.map((key) => [
      key.keyId,
      key.epoch,
      key.algorithm,
      key.purpose,
      key.publicKey,
      key.notBefore,
      key.notAfter,
      key.status,
    ]),
  ]);
}

function rawToDerPublicKey(base64url) {
  const raw = Buffer.from(base64url, "base64url");
  if (raw.length !== 65 || raw[0] !== 0x04) {
    fail(
      "A recipient or anchor key must be a 65-byte uncompressed P-256 point",
    );
  }
  const prefix = Buffer.from(
    "3059301306072a8648ce3d020106082a8648ce3d030107034200",
    "hex",
  );
  return createPublicKey({
    key: Buffer.concat([prefix, raw]),
    format: "der",
    type: "spki",
  });
}

function buildKeys(specifications, issuedAt, validUntil) {
  if (specifications.length === 0) fail("At least one --key is required");
  if (specifications.length > 2) {
    fail(
      "At most two recipients may be active: the Principal and one designate",
    );
  }
  return specifications.map((specification, index) => {
    const [keyId, epoch, publicKey] = specification.split(":");
    if (!keyId || !epoch || !publicKey) {
      fail(`--key must be <keyId>:<epoch>:<base64url-public-point>`);
    }
    rawToDerPublicKey(publicKey);
    return {
      keyId,
      epoch: Number(epoch),
      algorithm: "ECDH-P256",
      purpose: "room-enquiry",
      publicKey,
      notBefore: issuedAt.toISOString(),
      notAfter: validUntil.toISOString(),
      // The first --key is the one new submissions use; any second is retiring.
      status: index === 0 ? "active" : "retiring",
    };
  });
}

function signCommand(argv) {
  const parsed = options(argv);
  if (!parsed["anchor-key"]) fail("--anchor-key <pkcs8.pem> is required");
  if (!parsed["anchor-key-id"]) fail("--anchor-key-id is required");

  const issuedAt = new Date();
  const validDays = Number(parsed["valid-days"] ?? 30);
  const expiresAt = new Date(issuedAt.getTime() + validDays * DAY);
  const body = {
    manifestVersion: 1,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    keys: buildKeys(
      parsed.key,
      issuedAt,
      new Date(issuedAt.getTime() + 365 * DAY),
    ),
  };

  const anchor = createPrivateKey(readFileSync(parsed["anchor-key"], "utf8"));
  const signature = sign("sha256", Buffer.from(canonicalPayload(body)), {
    key: anchor,
    dsaEncoding: "ieee-p1363",
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ...body,
        signature: {
          algorithm: "ECDSA-P256-SHA256",
          keyId: parsed["anchor-key-id"],
          value: signature.toString("base64url"),
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function publishCommand(argv) {
  const parsed = options(argv);
  const uri = process.env.ROOM_MANIFEST_PUBLISHER_URI;
  if (!uri) fail("ROOM_MANIFEST_PUBLISHER_URI is required");
  if (!parsed.manifest) fail("--manifest <file.json> is required");
  if (!parsed["anchor-public"]) fail("--anchor-public is required");
  if (!parsed["anchor-key-id"]) fail("--anchor-key-id is required");

  const manifest = JSON.parse(readFileSync(parsed.manifest, "utf8"));
  const { signature, ...body } = manifest;
  if (signature?.keyId !== parsed["anchor-key-id"]) {
    fail("Manifest is not attributed to the pinned trust anchor");
  }
  const valid = verify(
    "sha256",
    Buffer.from(canonicalPayload(body)),
    {
      key: rawToDerPublicKey(parsed["anchor-public"]),
      dsaEncoding: "ieee-p1363",
    },
    Buffer.from(signature.value, "base64url"),
  );
  if (!valid)
    fail("Manifest signature does not verify against the pinned anchor");

  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const collection = client.db().collection("room_key_manifests");
    // The API cannot index this collection: it holds `find` only. The publisher
    // credential owns these indexes, so they are applied here.
    await collection.createIndexes([
      { key: { manifestId: 1 }, name: "room_manifest_unique", unique: true },
      { key: { active: 1, publishedAt: -1 }, name: "room_manifest_active" },
    ]);
    const manifestId = `rm-${body.issuedAt}`;
    await collection.updateMany({ active: true }, { $set: { active: false } });
    await collection.insertOne({
      manifestId,
      manifest,
      publishedAt: new Date(),
      active: true,
    });
    process.stdout.write(
      `Published ${manifestId} with ${body.keys.length} key(s); active key ${body.keys[0].keyId} epoch ${body.keys[0].epoch}\n`,
    );
  } finally {
    await client.close();
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === "sign") signCommand(rest);
else if (command === "publish") await publishCommand(rest);
else fail("Usage: publish-room-manifest.mjs <sign|publish> [options]");
