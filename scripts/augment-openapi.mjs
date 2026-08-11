import { readFile, writeFile } from "node:fs/promises";

const artifactUrl = new URL(
  "../packages/contracts/openapi/amanor-v1.json",
  import.meta.url,
);
const openApiModuleUrl = new URL(
  "../apps/api/dist/openapi.js",
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

const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
const { addCanonicalErrorContract, addRoomContract } = await import(
  openApiModuleUrl.href
);
addRoomContract(artifact);
addCanonicalErrorContract(artifact);
await writeFile(
  artifactUrl,
  `${JSON.stringify(canonical(artifact), null, 2)}\n`,
  "utf8",
);
