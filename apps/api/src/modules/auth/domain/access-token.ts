import {
  decodeProtectedHeader,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWTPayload,
} from "jose";
import { isRole, roles as supportedRoles, type Role } from "./roles";
import {
  authenticationMethodListIsValid,
  type AuthenticationMethod,
} from "./authentication-method";

const algorithm = "ES256";
const accessTokenLifetimeSeconds = 5 * 60;

export type AccessTokenClaims = Readonly<{
  subject: string;
  sessionId: string;
  roles: readonly Role[];
  roleVersion: number;
  authenticationMethods: readonly AuthenticationMethod[];
  stepUpAt?: number;
}>;

export type JwtConfiguration = Readonly<{
  issuer: string;
  audience: string;
  keyId: string;
}>;

export function readAccessTokenKeyId(token: string): string {
  const header = decodeProtectedHeader(token);
  if (
    header.alg !== algorithm ||
    header.typ !== "JWT" ||
    typeof header.kid !== "string" ||
    header.kid.length < 1 ||
    header.kid.length > 128
  ) {
    throw new Error("Access token header is invalid");
  }
  return header.kid;
}

export async function signAccessToken(
  privateKey: CryptoKey,
  configuration: JwtConfiguration,
  claims: AccessTokenClaims,
  now = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  if (
    claims.subject.length < 1 ||
    claims.subject.length > 128 ||
    claims.sessionId.length < 1 ||
    claims.sessionId.length > 128 ||
    claims.roles.length < 1 ||
    claims.roles.length > supportedRoles.length ||
    !claims.roles.every(isRole) ||
    new Set(claims.roles).size !== claims.roles.length ||
    !authenticationMethodListIsValid(claims.authenticationMethods) ||
    !Number.isSafeInteger(claims.roleVersion) ||
    claims.roleVersion < 1 ||
    (claims.stepUpAt !== undefined &&
      (!Number.isInteger(claims.stepUpAt) ||
        claims.stepUpAt < 1 ||
        claims.stepUpAt > issuedAt))
  ) {
    throw new Error("Access token claims are invalid");
  }
  return new SignJWT({
    sid: claims.sessionId,
    roles: claims.roles,
    roleVersion: claims.roleVersion,
    amr: claims.authenticationMethods,
    ...(claims.stepUpAt ? { stepUpAt: claims.stepUpAt } : {}),
  })
    .setProtectedHeader({
      alg: algorithm,
      typ: "JWT",
      kid: configuration.keyId,
    })
    .setIssuer(configuration.issuer)
    .setAudience(configuration.audience)
    .setSubject(claims.subject)
    .setJti(crypto.randomUUID())
    .setIssuedAt(issuedAt)
    .setNotBefore(issuedAt)
    .setExpirationTime(issuedAt + accessTokenLifetimeSeconds)
    .sign(privateKey);
}

function parseClaims(payload: JWTPayload): AccessTokenClaims {
  const roles = payload.roles;
  const methods = payload.amr;
  const issuedAt = payload.iat;
  const notBefore = payload.nbf;
  const expiresAt = payload.exp;
  if (
    typeof payload.sub !== "string" ||
    payload.sub.length < 1 ||
    payload.sub.length > 128 ||
    typeof payload.sid !== "string" ||
    payload.sid.length < 1 ||
    payload.sid.length > 128 ||
    !Array.isArray(roles) ||
    roles.length < 1 ||
    roles.length > supportedRoles.length ||
    !roles.every(isRole) ||
    new Set(roles).size !== roles.length ||
    typeof payload.roleVersion !== "number" ||
    !Number.isSafeInteger(payload.roleVersion) ||
    payload.roleVersion < 1 ||
    !authenticationMethodListIsValid(methods) ||
    typeof payload.jti !== "string" ||
    payload.jti.length < 1 ||
    payload.jti.length > 128 ||
    !isInteger(issuedAt) ||
    !isInteger(notBefore) ||
    !isInteger(expiresAt) ||
    notBefore !== issuedAt ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > accessTokenLifetimeSeconds ||
    (payload.stepUpAt !== undefined &&
      (typeof payload.stepUpAt !== "number" ||
        !Number.isInteger(payload.stepUpAt) ||
        payload.stepUpAt < 1 ||
        payload.stepUpAt > issuedAt))
  ) {
    throw new Error("Access token claims are incomplete");
  }

  return {
    subject: payload.sub,
    sessionId: payload.sid,
    roles,
    roleVersion: payload.roleVersion,
    authenticationMethods: methods,
    ...(typeof payload.stepUpAt === "number"
      ? { stepUpAt: payload.stepUpAt }
      : {}),
  };
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export async function verifyAccessToken(
  token: string,
  publicKey: CryptoKey,
  configuration: JwtConfiguration,
): Promise<AccessTokenClaims> {
  const verified = await jwtVerify(token, publicKey, {
    algorithms: [algorithm],
    issuer: configuration.issuer,
    audience: configuration.audience,
    typ: "JWT",
    clockTolerance: 5,
    requiredClaims: [
      "sub",
      "sid",
      "roles",
      "roleVersion",
      "amr",
      "jti",
      "iat",
      "nbf",
      "exp",
    ],
  });
  if (verified.protectedHeader.kid !== configuration.keyId) {
    throw new Error("Access token key ID is not active");
  }
  return parseClaims(verified.payload);
}
