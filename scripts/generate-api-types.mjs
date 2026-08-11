import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const mode = process.argv[2] ?? "check";
const sourceUrl = new URL(
  "../packages/contracts/openapi/amanor-v1.json",
  import.meta.url,
);
const outputUrl = new URL(
  "../packages/contracts/src/generated/api-operations.ts",
  import.meta.url,
);
const document = JSON.parse(await readFile(sourceUrl, "utf8"));
const methods = new Set(["get", "post", "put", "patch", "delete"]);
const operations = [];
for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!methods.has(method) || !operation?.operationId) continue;
    const successStatuses = Object.keys(operation.responses ?? {})
      .filter((status) => /^2\d\d$/u.test(status))
      .map(Number);
    operations.push({
      operationId: operation.operationId,
      method: method.toUpperCase(),
      path,
      successStatuses,
    });
  }
}
operations.sort((left, right) =>
  left.operationId.localeCompare(right.operationId),
);
const entries = operations
  .map(
    (operation) =>
      `  readonly ${JSON.stringify(operation.operationId)}: { readonly method: ${JSON.stringify(operation.method)}; readonly path: ${JSON.stringify(operation.path)}; readonly successStatus: ${operation.successStatuses.join(" | ") || "never"} };`,
  )
  .join("\n");
const output = `// Generated from openapi/amanor-v1.json. Do not edit manually.\nexport interface ApiOperations {\n${entries}\n}\n\nexport type ApiOperationId = keyof ApiOperations;\n`;

if (mode === "generate") {
  await mkdir(new URL(".", outputUrl), { recursive: true });
  await writeFile(outputUrl, output, "utf8");
} else if (mode === "check") {
  if ((await readFile(outputUrl, "utf8")) !== output)
    throw new Error(
      "Generated API operation types are stale; run npm run contracts:generate",
    );
} else throw new Error("Usage: generate-api-types.mjs <generate|check>");
