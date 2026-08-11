import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { MigrationService } from "./migration.service";

describe("MigrationService", () => {
  it("does not touch MongoDB when bootstrap migrations are disabled", async () => {
    const database = { collection: vi.fn() };
    const service = new MigrationService(
      { db: database } as never,
      new ConfigService({ RUN_MIGRATIONS: "false" }),
    );
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(database.collection).not.toHaveBeenCalled();
  });

  it("fails closed when enabled without a database connection", async () => {
    const service = new MigrationService(
      { db: undefined } as never,
      new ConfigService({ RUN_MIGRATIONS: "true" }),
    );
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      /unavailable/i,
    );
  });
});
