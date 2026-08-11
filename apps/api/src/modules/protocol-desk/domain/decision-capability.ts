import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { RequestState } from "./engagement-request";

export const principalDecisionActions = [
  "accept",
  "decline",
  "hold",
  "request_information",
] as const;
export type PrincipalDecisionAction = (typeof principalDecisionActions)[number];

export type DecisionCapability = Readonly<{
  capabilityId: string;
  requestId: string;
  action: PrincipalDecisionAction;
  tokenHash: string;
  status: "active" | "consumed" | "revoked";
  issuedBy: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
  deliveryId?: string;
}>;

export function issueDecisionCapability(
  requestId: string,
  action: PrincipalDecisionAction,
  issuedBy: string,
  now = new Date(),
): Readonly<{ capability: DecisionCapability; token: string }> {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    capability: {
      capabilityId: randomUUID(),
      requestId,
      action,
      tokenHash: hashDecisionToken(token),
      status: "active",
      issuedBy,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1_000),
    },
  };
}

export function issueDeliveryDecisionCapability(
  requestId: string,
  deliveryId: string,
  action: PrincipalDecisionAction,
  issuedBy: string,
  derivationKey: string,
  now = new Date(),
): Readonly<{ capability: DecisionCapability; token: string }> {
  const capabilityId = randomUUID();
  const token = deriveDecisionToken(
    { capabilityId, requestId, deliveryId, action },
    derivationKey,
  );
  return {
    token,
    capability: {
      capabilityId,
      requestId,
      deliveryId,
      action,
      tokenHash: hashDecisionToken(token),
      status: "active",
      issuedBy,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1_000),
    },
  };
}

export function deriveDecisionToken(
  capability: Pick<
    DecisionCapability,
    "capabilityId" | "requestId" | "deliveryId" | "action"
  >,
  derivationKey: string,
): string {
  if (!capability.deliveryId)
    throw new Error("Decision delivery identifier is required");
  const key = Buffer.from(derivationKey, "base64");
  if (key.length !== 32)
    throw new Error("Protocol decision derivation key is invalid");
  const signature = createHmac("sha256", key)
    .update(
      [
        "amanor-protocol-decision-v1",
        capability.capabilityId,
        capability.requestId,
        capability.deliveryId,
        capability.action,
      ].join("\0"),
      "utf8",
    )
    .digest("base64url");
  return `${capability.capabilityId}.${signature}`;
}

export function hashDecisionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function stateForDecision(
  action: PrincipalDecisionAction,
): RequestState {
  if (action === "accept") return "accepted";
  if (action === "decline") return "declined";
  if (action === "hold") return "held";
  return "info_requested";
}
