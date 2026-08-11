import type { MongoMigration } from "../types";

export const principalDecisionDeliveriesMigration: MongoMigration = {
  id: "20260811_031_principal_decision_deliveries",
  description:
    "Create the durable provider-idempotent Principal decision delivery queue",
  async up(db) {
    const deliveries = db.collection("protocol_principal_decision_deliveries");
    await deliveries.createIndex({ deliveryId: 1 }, { unique: true });
    await deliveries.createIndex({ requestId: 1 }, { unique: true });
    await deliveries.createIndex({ status: 1, availableAt: 1 });
  },
};
