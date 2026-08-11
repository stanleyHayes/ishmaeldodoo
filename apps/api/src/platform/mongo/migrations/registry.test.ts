import { describe, expect, it } from "vitest";
import { assertMigrationRegistry, migrations } from "./registry";
import { migrationChecksum } from "./runner";

describe("MongoDB migration registry", () => {
  it("is unique, ordered and checksum-stable", () => {
    expect(() => assertMigrationRegistry(migrations)).not.toThrow();
    expect(migrationChecksum(migrations[0])).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects duplicate and unordered migrations", () => {
    const first = migrations[0];
    const duplicate = [first, first];
    const earlier = { ...first, id: "20200101_001_earlier" };

    expect(() => assertMigrationRegistry(duplicate)).toThrow(/unique/i);
    expect(() => assertMigrationRegistry([first, earlier])).toThrow(
      /ascending/i,
    );
  });
});
