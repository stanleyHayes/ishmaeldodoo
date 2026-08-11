import type { MongoMigration } from "../types";

export const calendarSyncJobsMigration: MongoMigration = {
  id: "20260810_028_calendar_sync_jobs",
  description:
    "Create the durable idempotent Protocol Desk calendar synchronization queue",
  async up(db) {
    const jobs = db.collection("calendar_sync_jobs");
    await jobs.createIndex({ syncId: 1 }, { unique: true });
    await jobs.createIndex({ requestId: 1, operation: 1 }, { unique: true });
    await jobs.createIndex({ status: 1, availableAt: 1 });
  },
};
