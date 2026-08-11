import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { getConnectionToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import type { Connection } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOpenApiDocument } from "./openapi";
import { disposableMongoUri } from "./platform/mongo/test-mongo-uri";

const testUri = process.env.MONGODB_TEST_URI;
const integration = testUri ? describe : describe.skip;

integration("complete NestJS application", () => {
  let app: INestApplication;
  const previousMongoUri = process.env.MONGODB_URI;
  const previousNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    const databaseName = `amanor_app_${randomUUID().replaceAll("-", "")}`;
    process.env.MONGODB_URI = disposableMongoUri(testUri!, databaseName);
    process.env.NODE_ENV = "test";
    const { AppModule } = await import("./app.module.js");
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
    const connection = app.get<Connection>(getConnectionToken());
    expect(connection.name).toBe(databaseName);
  }, 20_000);

  afterAll(async () => {
    if (app) {
      const connection = app.get<Connection>(getConnectionToken());
      if (connection.db) await connection.db.dropDatabase();
      await app.close();
    }
    if (previousMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousMongoUri;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it("constructs every module and matches the committed OpenAPI contract", async () => {
    type ContractPaths = Record<
      string,
      Record<
        string,
        { operationId?: string; responses?: Record<string, unknown> }
      >
    >;
    const artifact = JSON.parse(
      await readFile(
        resolve(
          process.cwd(),
          "../../packages/contracts/openapi/amanor-v1.json",
        ),
        "utf8",
      ),
    ) as { paths: ContractPaths };
    const runtime = createOpenApiDocument(app);
    if (process.env.UPDATE_OPENAPI_ARTIFACT === "true") {
      const canonical = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(canonical);
        if (value && typeof value === "object")
          return Object.fromEntries(
            Object.entries(value)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, item]) => [key, canonical(item)]),
          );
        return value;
      };
      await writeFile(
        resolve(
          process.cwd(),
          "../../packages/contracts/openapi/amanor-v1.json",
        ),
        `${JSON.stringify(canonical(runtime), null, 2)}\n`,
        "utf8",
      );
      Object.assign(artifact, runtime);
    }
    const surface = (paths: typeof artifact.paths) =>
      Object.fromEntries(
        Object.entries(paths).map(([path, item]) => [
          path,
          Object.fromEntries(
            Object.entries(item)
              .filter(([method]) =>
                ["get", "post", "put", "patch", "delete"].includes(method),
              )
              .map(([method, operation]) => [
                method,
                {
                  operationId: operation.operationId,
                  statuses: Object.keys(operation.responses ?? {}).sort(),
                },
              ]),
          ),
        ]),
      );
    expect(surface(runtime.paths as unknown as ContractPaths)).toEqual(
      surface(artifact.paths),
    );
  });
});
