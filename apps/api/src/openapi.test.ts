import { describe, expect, it, vi } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { SwaggerModule } from "@nestjs/swagger";
import { createOpenApiDocument } from "./openapi";

describe("OpenAPI conventions", () => {
  it("adds the canonical error envelope to every operation", () => {
    const create = vi.spyOn(SwaggerModule, "createDocument").mockReturnValue({
      openapi: "3.0.0",
      info: { title: "test", version: "1" },
      paths: {
        "/v1/example": {
          get: {
            operationId: "example",
            responses: { 200: { description: "ok" } },
          },
        },
      },
    });

    const document = createOpenApiDocument({} as INestApplication);

    expect(document.components?.schemas?.ErrorEnvelope).toMatchObject({
      required: ["statusCode", "code", "message", "requestId", "timestamp"],
    });
    expect(document.paths["/v1/example"]?.get?.responses.default).toMatchObject(
      {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
          },
        },
      },
    );
    const roomOperations = Object.values(document.paths)
      .flatMap((path) =>
        ["get", "post", "put", "patch", "delete"].flatMap((method) => {
          const operation = path[method as keyof typeof path];
          return operation &&
            typeof operation === "object" &&
            "operationId" in operation
            ? [operation.operationId]
            : [];
        }),
      )
      .filter((operationId) => String(operationId).startsWith("room"));
    expect(roomOperations).toEqual([
      "roomPublicKeyManifest",
      "roomSubmitEnquiry",
      "roomListEnquiries",
      "roomGetCiphertext",
      "roomChangeState",
      "roomExtendRetention",
      "roomGetDesignation",
      "roomGrantDesignation",
      "roomRevokeDesignation",
    ]);
    expect(
      document.paths["/v1/public/room/enquiries"]?.post?.requestBody,
    ).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/RoomSubmission" },
        },
      },
    });
    expect(document.paths["/v1/room/enquiries"]?.get?.security).toEqual([
      { bearer: [] },
    ]);
    const roomSchemaText = JSON.stringify(
      Object.fromEntries(
        Object.entries(document.components?.schemas ?? {}).filter(([name]) =>
          name.startsWith("Room"),
        ),
      ),
    );
    for (const plaintextField of [
      '"subject"',
      '"message"',
      '"fromName"',
      '"fromEmail"',
      '"organisation"',
    ])
      expect(roomSchemaText).not.toContain(plaintextField);
    create.mockRestore();
  });
});
