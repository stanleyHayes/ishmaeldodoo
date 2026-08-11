import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const image = process.argv[2] ?? "amanor-api:verification";
const output = process.argv[3] ?? "artifacts/sbom/amanor-api.spdx.json";
mkdirSync(output.slice(0, output.lastIndexOf("/")), { recursive: true });
const result = spawnSync("docker", ["sbom", "--format", "spdx-json", image], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
if (result.status !== 0)
  throw new Error(`SBOM generation failed\n${result.stderr}`);
const document = JSON.parse(result.stdout);
if (
  !String(document.spdxVersion).startsWith("SPDX-") ||
  !Array.isArray(document.packages) ||
  document.packages.length === 0
)
  throw new Error("Generated SBOM is empty or invalid");
await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(output, result.stdout, "utf8"),
);
process.stdout.write(
  `Wrote ${document.spdxVersion} SBOM with ${document.packages.length} packages to ${output}\n`,
);
