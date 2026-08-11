export const securityEventTypes = [
  "login_succeeded",
  "login_failed",
  "session_refreshed",
  "session_revoked",
  "refresh_token_reuse",
  "role_changed",
  "password_changed",
  "mfa_challenged",
  "mfa_recovered",
  "recovery_codes_rotated",
  "user_disabled",
  "user_enabled",
  "user_invited",
  "invitation_accepted",
  "privileged_data_read",
  "hardware_key_enrolled",
  "hardware_key_authenticated",
  "hardware_key_revoked",
] as const;

export type SecurityEvent = Readonly<{
  eventId: string;
  type: (typeof securityEventTypes)[number];
  actorId?: string;
  subjectId?: string;
  sessionId?: string;
  occurredAt: Date;
  ipHash?: string;
  userAgentFamily?: string;
  outcome: "success" | "failure";
  reason?: string;
  previousEventHash?: string;
  eventHash?: string;
  chainSequence?: number;
}>;

const forbiddenMetadataKeys = /password|token|cookie|secret|code/i;

export function assertSafeSecurityEvent(event: SecurityEvent): void {
  for (const [key, value] of Object.entries(event)) {
    if (forbiddenMetadataKeys.test(key) && value) {
      throw new Error(`Security event field ${key} may expose secret material`);
    }
  }
}

export function securityEventHash(
  event: Omit<SecurityEvent, "eventHash">,
  previousEventHash?: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        eventId: event.eventId,
        type: event.type,
        actorId: event.actorId ?? null,
        subjectId: event.subjectId ?? null,
        sessionId: event.sessionId ?? null,
        occurredAt: event.occurredAt.toISOString(),
        ipHash: event.ipHash ?? null,
        userAgentFamily: event.userAgentFamily ?? null,
        outcome: event.outcome,
        reason: event.reason ?? null,
        previousEventHash: previousEventHash ?? null,
        chainSequence: event.chainSequence ?? null,
      }),
    )
    .digest("hex");
}
import { createHash } from "node:crypto";
