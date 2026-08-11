import type { INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from "@nestjs/swagger";

const json = (schema: Record<string, unknown>): Record<string, unknown> => ({
  "application/json": { schema },
});

const schemaRef = (name: string): Record<string, unknown> => ({
  $ref: `#/components/schemas/${name}`,
});

const roomReferenceParameter = {
  name: "reference",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^RM-[0-9]{4}-[A-Z2-7]{16}$" },
} as const;

/**
 * The Room controllers are deliberately absent when ROOM_ENABLED is false.
 * Its versioned product contract must nevertheless remain stable so the public
 * and Admin clients can compile before a deployment completes key custody.
 * These paths are therefore merged into the canonical document independently
 * of runtime route registration. A disabled deployment still exposes no Room
 * route; the contract descriptions make the feature gate explicit.
 */
export function addRoomContract(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.schemas ??= {};
  Object.assign(document.components.schemas, {
    RoomRecipientKey: {
      type: "object",
      additionalProperties: false,
      required: [
        "keyId",
        "epoch",
        "algorithm",
        "purpose",
        "publicKey",
        "notBefore",
        "notAfter",
        "status",
      ],
      properties: {
        keyId: {
          type: "string",
          pattern: "^rk-[0-9a-z][0-9a-z-]{4,47}$",
        },
        epoch: { type: "integer", minimum: 1 },
        algorithm: { type: "string", enum: ["ECDH-P256"] },
        purpose: { type: "string", enum: ["room-enquiry"] },
        publicKey: {
          type: "string",
          minLength: 87,
          maxLength: 87,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        notBefore: { type: "string", format: "date-time" },
        notAfter: { type: "string", format: "date-time" },
        status: { type: "string", enum: ["active", "retiring"] },
      },
    },
    RoomKeyManifest: {
      type: "object",
      additionalProperties: false,
      required: [
        "manifestVersion",
        "issuedAt",
        "expiresAt",
        "keys",
        "signature",
      ],
      properties: {
        manifestVersion: { type: "integer", enum: [1] },
        issuedAt: { type: "string", format: "date-time" },
        expiresAt: { type: "string", format: "date-time" },
        keys: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          items: schemaRef("RoomRecipientKey"),
        },
        signature: {
          type: "object",
          additionalProperties: false,
          required: ["algorithm", "keyId", "value"],
          properties: {
            algorithm: { type: "string", enum: ["ECDSA-P256-SHA256"] },
            keyId: {
              type: "string",
              pattern: "^ta-[0-9a-z][0-9a-z-]{4,47}$",
            },
            value: {
              type: "string",
              minLength: 86,
              maxLength: 86,
              pattern: "^[A-Za-z0-9_-]+$",
            },
          },
        },
      },
    },
    RoomEnvelope: {
      type: "object",
      additionalProperties: false,
      required: [
        "envelopeVersion",
        "suite",
        "envelopeId",
        "recipientKeyId",
        "keyEpoch",
        "ephemeralPublicKey",
        "nonce",
        "ciphertext",
      ],
      properties: {
        envelopeVersion: { type: "integer", enum: [1] },
        suite: {
          type: "string",
          enum: ["ECDH-P256-HKDF-SHA256-AES256GCM"],
        },
        envelopeId: { type: "string", pattern: "^[0-9a-f]{32}$" },
        recipientKeyId: {
          type: "string",
          pattern: "^rk-[0-9a-z][0-9a-z-]{4,47}$",
        },
        keyEpoch: { type: "integer", minimum: 1 },
        ephemeralPublicKey: {
          type: "string",
          minLength: 87,
          maxLength: 87,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        nonce: {
          type: "string",
          minLength: 16,
          maxLength: 16,
          pattern: "^[A-Za-z0-9_-]+$",
        },
        ciphertext: {
          type: "string",
          minLength: 24,
          maxLength: 12000,
          pattern: "^[A-Za-z0-9_-]+$",
        },
      },
    },
    RoomSubmission: {
      type: "object",
      additionalProperties: false,
      required: [
        "envelope",
        "locale",
        "confidentialityAcknowledged",
        "procurementAcknowledged",
      ],
      properties: {
        envelope: schemaRef("RoomEnvelope"),
        locale: { type: "string", enum: ["en-GB", "fr-FR"] },
        confidentialityAcknowledged: { type: "boolean", enum: [true] },
        procurementAcknowledged: { type: "boolean", enum: [true] },
      },
    },
    RoomReceipt: {
      type: "object",
      additionalProperties: false,
      required: ["reference", "status", "deleteAfter"],
      properties: {
        reference: {
          type: "string",
          pattern: "^RM-[0-9]{4}-[A-Z2-7]{16}$",
        },
        status: { type: "string", enum: ["received"] },
        deleteAfter: { type: "string", format: "date-time" },
      },
    },
    RoomInboxItem: {
      type: "object",
      additionalProperties: false,
      required: [
        "reference",
        "state",
        "locale",
        "recipientKeyId",
        "keyEpoch",
        "receivedAt",
        "deleteAfter",
        "extensionCount",
        "ciphertextBytes",
      ],
      properties: {
        reference: {
          type: "string",
          pattern: "^RM-[0-9]{4}-[A-Z2-7]{16}$",
        },
        state: {
          type: "string",
          enum: ["received", "read", "actioned", "quarantined"],
        },
        locale: { type: "string", enum: ["en-GB", "fr-FR"] },
        recipientKeyId: {
          type: "string",
          pattern: "^rk-[0-9a-z][0-9a-z-]{4,47}$",
        },
        keyEpoch: { type: "integer", minimum: 1 },
        receivedAt: { type: "string", format: "date-time" },
        deleteAfter: { type: "string", format: "date-time" },
        extensionCount: { type: "integer", minimum: 0 },
        ciphertextBytes: { type: "integer", minimum: 1 },
      },
    },
    RoomInboxPage: {
      type: "object",
      additionalProperties: false,
      required: ["items", "total"],
      properties: {
        items: {
          type: "array",
          maxItems: 50,
          items: schemaRef("RoomInboxItem"),
        },
        total: { type: "integer", minimum: 0 },
      },
    },
    RoomCiphertext: {
      type: "object",
      additionalProperties: false,
      required: ["reference", "envelope", "receivedAt", "deleteAfter"],
      properties: {
        reference: {
          type: "string",
          pattern: "^RM-[0-9]{4}-[A-Z2-7]{16}$",
        },
        envelope: schemaRef("RoomEnvelope"),
        receivedAt: { type: "string", format: "date-time" },
        deleteAfter: { type: "string", format: "date-time" },
      },
    },
    RoomStateChange: {
      type: "object",
      additionalProperties: false,
      required: ["state"],
      properties: {
        state: {
          type: "string",
          enum: ["read", "actioned", "quarantined"],
        },
      },
    },
    RoomExtension: {
      type: "object",
      additionalProperties: false,
      required: ["reason", "days"],
      properties: {
        reason: {
          type: "string",
          enum: ["active_conversation", "legal_hold", "security_investigation"],
        },
        days: { type: "integer", minimum: 1, maximum: 180 },
      },
    },
    RoomDesignation: {
      type: "object",
      additionalProperties: false,
      required: ["userId", "expiresAt"],
      properties: {
        userId: { type: "string", minLength: 1, maxLength: 64 },
        expiresAt: { type: "string", format: "date-time" },
      },
    },
    RoomDesignationState: {
      type: "object",
      additionalProperties: false,
      required: ["designate"],
      properties: {
        designate: {
          nullable: true,
          oneOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              required: ["userId", "grantedAt", "expiresAt", "active"],
              properties: {
                userId: { type: "string" },
                grantedAt: { type: "string", format: "date-time" },
                expiresAt: { type: "string", format: "date-time" },
                active: { type: "boolean" },
              },
            },
          ],
        },
      },
    },
    RoomStatus: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: { status: { type: "string", enum: ["ok"] } },
    },
  });

  const gated =
    "Feature-gated: this operation is registered only when ROOM_ENABLED=true and key-custody prerequisites pass.";
  const ok = (
    description: string,
    schema: string,
  ): Record<string, unknown> => ({
    200: { description, content: json(schemaRef(schema)) },
  });
  const accepted = (
    description: string,
    schema: string,
  ): Record<string, unknown> => ({
    202: { description, content: json(schemaRef(schema)) },
  });
  const body = (schema: string): Record<string, unknown> => ({
    required: true,
    content: json(schemaRef(schema)),
  });
  const protectedOperation = { security: [{ bearer: [] }] };

  Object.assign(document.paths, {
    "/v1/public/room/key-manifest": {
      get: {
        tags: ["room"],
        operationId: "roomPublicKeyManifest",
        description: gated,
        responses: ok("Signed recipient-key manifest.", "RoomKeyManifest"),
      },
    },
    "/v1/public/room/enquiries": {
      post: {
        tags: ["room"],
        operationId: "roomSubmitEnquiry",
        description: gated,
        requestBody: body("RoomSubmission"),
        responses: accepted("Ciphertext accepted.", "RoomReceipt"),
      },
    },
    "/v1/room/enquiries": {
      get: {
        ...protectedOperation,
        tags: ["room-operator"],
        operationId: "roomListEnquiries",
        description: gated,
        responses: ok("Metadata-only Room inbox.", "RoomInboxPage"),
      },
    },
    "/v1/room/enquiries/{reference}/ciphertext": {
      get: {
        ...protectedOperation,
        tags: ["room-operator"],
        operationId: "roomGetCiphertext",
        description: gated,
        parameters: [roomReferenceParameter],
        responses: ok(
          "Ciphertext for local client decryption.",
          "RoomCiphertext",
        ),
      },
    },
    "/v1/room/enquiries/{reference}/state": {
      post: {
        ...protectedOperation,
        tags: ["room-operator"],
        operationId: "roomChangeState",
        description: gated,
        parameters: [roomReferenceParameter],
        requestBody: body("RoomStateChange"),
        responses: ok("Lifecycle state recorded.", "RoomStatus"),
      },
    },
    "/v1/room/enquiries/{reference}/extension": {
      post: {
        ...protectedOperation,
        tags: ["room-operator"],
        operationId: "roomExtendRetention",
        description: gated,
        parameters: [roomReferenceParameter],
        requestBody: body("RoomExtension"),
        responses: ok("Bounded retention extension recorded.", "RoomReceipt"),
      },
    },
    "/v1/room/designation": {
      get: {
        ...protectedOperation,
        tags: ["room-operator"],
        operationId: "roomGetDesignation",
        description: gated,
        responses: ok("Current designation state.", "RoomDesignationState"),
      },
      post: {
        ...protectedOperation,
        tags: ["room-operator"],
        operationId: "roomGrantDesignation",
        description: gated,
        requestBody: body("RoomDesignation"),
        responses: ok("Designation granted.", "RoomDesignationState"),
      },
      delete: {
        ...protectedOperation,
        tags: ["room-operator"],
        operationId: "roomRevokeDesignation",
        description: gated,
        responses: ok("Designation revoked.", "RoomDesignationState"),
      },
    },
  });
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle("Project AMANOR API")
    .setDescription(
      "Backend contracts for the public platform, CMS and operations console.",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, configuration);
  addRoomContract(document);
  addCanonicalErrorContract(document);
  return document;
}

export function addCanonicalErrorContract(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ErrorEnvelope = {
    type: "object",
    additionalProperties: false,
    required: ["statusCode", "code", "message", "requestId", "timestamp"],
    properties: {
      statusCode: { type: "integer", minimum: 400, maximum: 599 },
      code: { type: "string", minLength: 1 },
      message: { type: "string", minLength: 1 },
      requestId: { type: "string", minLength: 1 },
      timestamp: { type: "string", format: "date-time" },
    },
  };
  const methods = ["get", "post", "put", "patch", "delete"] as const;
  for (const pathItem of Object.values(document.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;
      operation.responses.default ??= {
        description:
          "Error response. The status code is repeated in the bounded JSON envelope.",
        headers: {
          "X-Request-ID": {
            description: "Correlation identifier safe to quote to support.",
            schema: { type: "string" },
          },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
          },
        },
      };
    }
  }
}
