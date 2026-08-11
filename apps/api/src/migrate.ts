import "reflect-metadata";
import mongoose from "mongoose";
import { migrations } from "./platform/mongo/migrations/registry";
import { runMigrations } from "./platform/mongo/migrations/runner";

async function migrate(): Promise<void> {
  const uri = process.env.MONGODB_MIGRATION_URI;
  if (!uri)
    throw new Error(
      "MONGODB_MIGRATION_URI is required for the one-shot migration command",
    );
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 2,
  });
  try {
    if (!mongoose.connection.db)
      throw new Error("MongoDB migration database is unavailable");
    const applied = await runMigrations(mongoose.connection.db, migrations);
    process.stdout.write(`Applied ${applied.length} migration(s)\n`);
  } finally {
    await mongoose.disconnect();
  }
}

void migrate().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "MongoDB migration failed"}\n`,
  );
  process.exitCode = 1;
});
