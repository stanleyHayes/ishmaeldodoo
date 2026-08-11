import type { Db } from "mongodb";

export type MongoMigration = Readonly<{
  id: string;
  description: string;
  up(db: Db): Promise<void>;
}>;

export type AppliedMigration = Readonly<{
  migrationId: string;
  description: string;
  checksum: string;
  appliedAt: Date;
}>;
