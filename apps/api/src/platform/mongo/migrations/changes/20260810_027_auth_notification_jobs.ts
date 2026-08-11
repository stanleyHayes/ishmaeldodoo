import type { MongoMigration } from "../types";

export const authNotificationJobsMigration: MongoMigration = {
  id: "20260810_027_auth_notification_jobs",
  description:
    "Create the durable idempotent administrator recovery notification queue",
  async up(db) {
    const jobs = db.collection("auth_notification_jobs");
    await jobs.createIndex({ notificationId: 1 }, { unique: true });
    await jobs.createIndex({ status: 1, availableAt: 1 });
    await jobs.createIndex({ userId: 1, occurredAt: -1 });
  },
};
