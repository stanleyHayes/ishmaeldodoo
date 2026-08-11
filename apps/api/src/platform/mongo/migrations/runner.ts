import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { assertMigrationRegistry } from "./registry";
import type { AppliedMigration, MongoMigration } from "./types";

const migrationCollection = "migrations";

export function migrationChecksum(migration: MongoMigration): string {
  return createHash("sha256")
    .update(
      `${migration.id}\n${migration.description}\n${migration.up.toString()}`,
    )
    .digest("hex");
}

export async function runMigrations(
  db: Db,
  registry: readonly MongoMigration[],
): Promise<readonly string[]> {
  assertMigrationRegistry(registry);

  const collection = db.collection<AppliedMigration>(migrationCollection);
  await collection.createIndex({ migrationId: 1 }, { unique: true });

  const alreadyApplied = await collection
    .find({})
    .sort({ migrationId: 1 })
    .toArray();
  const appliedById = new Map(
    alreadyApplied.map((item) => [item.migrationId, item]),
  );
  const newlyApplied: string[] = [];

  for (const migration of registry) {
    const checksum = migrationChecksum(migration);
    const previous = appliedById.get(migration.id);

    if (previous) {
      if (previous.checksum !== checksum) {
        throw new Error(`Applied migration ${migration.id} has been modified`);
      }
      continue;
    }

    await migration.up(db);
    await collection.insertOne({
      migrationId: migration.id,
      description: migration.description,
      checksum,
      appliedAt: new Date(),
    });
    newlyApplied.push(migration.id);
  }

  return newlyApplied;
}
