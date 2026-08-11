import { randomUUID } from "node:crypto";

export type PrincipalDecisionDelivery = Readonly<{
  deliveryId: string;
  requestId: string;
  status: "pending" | "processing" | "delivered" | "failed" | "cancelled";
  attempts: number;
  availableAt: Date;
  createdAt: Date;
  lockedAt?: Date;
  deliveredAt?: Date;
  providerMessageId?: string;
  lastError?: string;
}>;

export function principalDecisionDelivery(
  requestId: string,
  now = new Date(),
): PrincipalDecisionDelivery {
  return {
    deliveryId: randomUUID(),
    requestId,
    status: "pending",
    attempts: 0,
    availableAt: now,
    createdAt: now,
  };
}
