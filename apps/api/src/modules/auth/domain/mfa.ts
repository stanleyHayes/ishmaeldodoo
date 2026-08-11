import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateMfaSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let encoded = "";
  for (let offset = 0; offset < bits.length; offset += 5) {
    encoded +=
      base32Alphabet[
        Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)
      ];
  }
  return encoded;
}

export function totpEnrollmentUri(secret: string, email: string): string {
  const issuer = "Project AMANOR";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export type EncryptedMfaSecret = Readonly<{
  encryptedSecret: string;
  iv: string;
  authTag: string;
}>;

function encryptionKey(rawKey: string): Buffer {
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32)
    throw new Error("MFA encryption key must be 32 bytes encoded as base64");
  return key;
}

export function encryptMfaSecret(
  secret: string,
  rawKey: string,
): EncryptedMfaSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(rawKey), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedSecret: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptMfaSecret(
  value: EncryptedMfaSecret,
  rawKey: string,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(rawKey),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.encryptedSecret, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptMfaSecretWithKeys(
  value: EncryptedMfaSecret,
  keys: readonly [string, ...string[]],
): Readonly<{ secret: string; keyIndex: number }> {
  for (const [keyIndex, key] of keys.entries()) {
    try {
      return { secret: decryptMfaSecret(value, key), keyIndex };
    } catch {
      // AES-GCM authentication rejects keys that did not encrypt this value.
    }
  }
  throw new Error("MFA secret cannot be decrypted with a trusted key");
}

function decodeBase32(value: string): Buffer {
  const normalized = value
    .replace(/=+$/u, "")
    .replace(/\s+/gu, "")
    .toUpperCase();
  let bits = "";
  for (const character of normalized) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error("MFA secret is not valid base32");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpAt(secret: string, timeStep: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return binary.toString().padStart(6, "0");
}

export function verifyTotp(
  secret: string,
  candidate: string,
  now = new Date(),
): boolean {
  return matchedTotpStep(secret, candidate, now) !== null;
}

export function matchedTotpStep(
  secret: string,
  candidate: string,
  now = new Date(),
): number | null {
  if (!/^\d{6}$/u.test(candidate)) return null;
  const step = Math.floor(now.getTime() / 30_000);
  for (const window of [-1, 0, 1]) {
    const expected = Buffer.from(totpAt(secret, step + window));
    const actual = Buffer.from(candidate);
    if (expected.length === actual.length && timingSafeEqual(expected, actual))
      return step + window;
  }
  return null;
}

export function generateTotpForTesting(secret: string, now: Date): string {
  return totpAt(secret, Math.floor(now.getTime() / 30_000));
}
