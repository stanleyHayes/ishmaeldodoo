import { randomUUID } from "node:crypto";
import type { Role } from "./roles";
import type { AuthenticationMethod } from "./authentication-method";

export type Session = Readonly<{
  sessionId: string;
  familyId: string;
  userId: string;
  roles: readonly Role[];
  roleVersion: number;
  currentRefreshHash: string;
  csrfHash: string;
  authenticationMethods: readonly AuthenticationMethod[];
  expiresAt: Date;
  revokedAt?: Date;
  revokeReason?: string;
}>;

export function newSessionIdentity(): Readonly<{
  sessionId: string;
  familyId: string;
}> {
  return { sessionId: randomUUID(), familyId: randomUUID() };
}

export function sessionIsActive(session: Session, now = new Date()): boolean {
  return !session.revokedAt && session.expiresAt > now;
}
