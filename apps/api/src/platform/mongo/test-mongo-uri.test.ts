import { describe, expect, it } from "vitest";
import { disposableMongoUri } from "./test-mongo-uri";

const databaseName = "amanor_integration_0123456789abcdef0123456789abcdef";

describe("disposable MongoDB test URI", () => {
  it("builds an isolated replica URI only from a loopback base", () => {
    expect(
      disposableMongoUri("mongodb://test:test@127.0.0.1:27028", databaseName),
    ).toBe(
      `mongodb://test:test@127.0.0.1:27028/${databaseName}?authSource=admin&replicaSet=rs0&directConnection=true`,
    );
  });

  it.each([
    "mongodb://production.example/",
    "mongodb+srv://production.example/",
    "mongodb://127.0.0.1/project_amanor",
  ])("rejects a non-disposable base URI: %s", (uri) => {
    expect(() => disposableMongoUri(uri, databaseName)).toThrow(
      /loopback|protocol|existing database/u,
    );
  });

  it("rejects an unscoped database name", () => {
    expect(() =>
      disposableMongoUri("mongodb://127.0.0.1:27028", "project_amanor"),
    ).toThrow("Integration database name is not disposable");
  });
});
