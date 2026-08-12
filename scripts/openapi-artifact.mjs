import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const [, , mode = "check", ...extraArguments] = process.argv;
const docsUrl = new URL("http://127.0.0.1:4000/v1/docs-json");
const artifactUrl = new URL(
  "../packages/contracts/openapi/amanor-v1.json",
  import.meta.url,
);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

const serialize = (value) => `${JSON.stringify(canonical(value), null, 2)}\n`;

if (extraArguments.length > 0)
  throw new Error(
    "OpenAPI source is fixed; custom source arguments are forbidden",
  );

if (mode === "generate") {
  const response = await fetch(docsUrl, { redirect: "error" });
  if (!response.ok)
    throw new Error(`OpenAPI endpoint returned HTTP ${response.status}`);
  await mkdir(new URL(".", artifactUrl), { recursive: true });
  await writeFile(artifactUrl, serialize(await response.json()), "utf8");
} else if (mode === "check") {
  const expected = await readFile(artifactUrl, "utf8");
  const response = await fetch(docsUrl, { redirect: "error" });
  if (!response.ok)
    throw new Error(`OpenAPI endpoint returned HTTP ${response.status}`);
  if (expected !== serialize(await response.json()))
    throw new Error("OpenAPI artifact is stale; run npm run openapi:generate");
} else if (mode === "validate") {
  const document = JSON.parse(await readFile(artifactUrl, "utf8"));
  const requiredPaths = [
    "/v1/health/live",
    "/v1/health/ready",
    "/v1/auth/login",
    "/v1/auth/refresh",
    "/v1/auth/logout",
    "/v1/auth/sessions",
    "/v1/auth/sessions/{sessionId}",
    "/v1/auth/users",
    "/v1/auth/users/{userId}/roles",
    "/v1/auth/users/{userId}/status",
    "/v1/auth/invitations",
    "/v1/auth/invitations/setup",
    "/v1/auth/invitations/accept",
    "/v1/auth/audit",
    "/v1/auth/audit/integrity",
    "/v1/auth/mfa/encryption-status",
    "/v1/auth/step-up",
    "/v1/auth/recovery-codes/rotate",
    "/v1/auth/hardware-keys",
    "/v1/auth/hardware-keys/{credentialId}",
    "/v1/public/signals",
    "/v1/public/legacy",
    "/v1/auth/hardware-keys/registration/options",
    "/v1/auth/hardware-keys/registration/verify",
    "/v1/auth/hardware-keys/authentication/options",
    "/v1/auth/hardware-keys/authentication/verify",
    "/v1/cms/content/{documentType}",
    "/v1/cms/content/source-audit/report",
    "/v1/cms/content/{documentType}/{documentId}/versions",
    "/v1/cms/content/{documentType}/{documentId}/audit",
    "/v1/cms/content/{documentType}/{documentId}/audit/export",
    "/v1/cms/content/{documentType}/{documentId}/audit/integrity",
    "/v1/cms/content/{documentType}/{documentId}/unpublish",
    "/v1/cms/content/{documentType}/{documentId}/versions/{version}/actions",
    "/v1/cms/content/{documentType}/{documentId}/versions/{version}/publish",
    "/v1/cms/content/{documentType}/{documentId}/versions/{version}/rollback",
    "/v1/public/content/{documentType}/{documentId}",
    "/v1/public/archive",
    "/v1/public/speaking",
    "/v1/public/signals/latest",
    "/v1/public/atlas",
    "/v1/public/sources",
    "/v1/internal/revalidation/claims/{idempotencyKey}",
    "/v1/media/uploads/sign",
    "/v1/media/assets",
    "/v1/media/assets/inventory",
    "/v1/media/assets/{assetId}",
    "/v1/public/media/{assetId}",
    "/v1/public/media-enquiries",
    "/v1/public/contact-enquiries",
    "/v1/public/press-kit",
    "/v1/public/living-dossier",
    "/v1/public/protocol-desk/requests",
    "/v1/public/protocol-desk/requests/principal-decisions",
    "/v1/desk/requests",
    "/v1/desk/requests/operations",
    "/v1/desk/requests/availability",
    "/v1/desk/requests/{requestId}",
    "/v1/desk/requests/{requestId}/assignment",
    "/v1/desk/requests/{requestId}/notes",
    "/v1/desk/requests/{requestId}/protocol-note",
    "/v1/desk/requests/{requestId}/protocol-note/configuration",
    "/v1/desk/requests/{requestId}/principal-decision-capabilities",
    "/v1/desk/requests/{requestId}/transitions",
    "/v1/desk/requests/{requestId}/correspondence/{correspondenceId}/retry",
    "/v1/desk/requests/{requestId}/principal-decision-delivery/{deliveryId}/retry",
    "/v1/desk/requests/{requestId}/flags/{flagId}/clearance",
    "/v1/public/room/key-manifest",
    "/v1/public/room/enquiries",
    "/v1/room/enquiries",
    "/v1/room/enquiries/{reference}/ciphertext",
    "/v1/room/enquiries/{reference}/state",
    "/v1/room/enquiries/{reference}/extension",
    "/v1/room/designation",
  ];
  if (document.openapi !== "3.0.0" || document.info?.version !== "1.0")
    throw new Error("Unexpected OpenAPI version");
  for (const path of requiredPaths)
    if (!document.paths?.[path])
      throw new Error(`OpenAPI artifact is missing ${path}`);
  const operationIds = new Set();
  const methods = new Set(["get", "post", "put", "patch", "delete"]);
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!path.startsWith("/v1/"))
      throw new Error(`OpenAPI path is not major-versioned: ${path}`);
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      if (!operation.operationId || operationIds.has(operation.operationId))
        throw new Error(
          `Missing or duplicate operationId at ${method} ${path}`,
        );
      operationIds.add(operation.operationId);
      const errorSchema =
        operation.responses?.default?.content?.["application/json"]?.schema
          ?.$ref;
      if (errorSchema !== "#/components/schemas/ErrorEnvelope")
        throw new Error(
          `Missing canonical error response at ${method} ${path}`,
        );
    }
  }
  const errorEnvelope = document.components?.schemas?.ErrorEnvelope;
  const requiredErrorFields = [
    "statusCode",
    "code",
    "message",
    "requestId",
    "timestamp",
  ];
  if (
    !errorEnvelope ||
    requiredErrorFields.some(
      (field) =>
        !errorEnvelope.required?.includes(field) ||
        !errorEnvelope.properties?.[field],
    )
  )
    throw new Error("OpenAPI ErrorEnvelope is incomplete");
} else {
  throw new Error("Usage: openapi-artifact.mjs <generate|check|validate>");
}
