import { runDeploymentSmoke } from "./smoke-deployment.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const attempts = 30;
let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const result = await runDeploymentSmoke({
      environment: process.env.AMANOR_SMOKE_ENVIRONMENT,
      webUrl: process.env.AMANOR_SMOKE_WEB_URL,
      adminUrl: process.env.AMANOR_SMOKE_ADMIN_URL,
      apiUrl: process.env.AMANOR_SMOKE_API_URL,
      edgeAuthorization: process.env.AMANOR_SMOKE_EDGE_AUTHORIZATION,
    });
    const evidencePath = process.env.AMANOR_SMOKE_EVIDENCE_PATH?.trim();
    if (evidencePath) {
      await mkdir(path.dirname(evidencePath), { recursive: true });
      await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, {
        mode: 0o600,
        flag: "wx",
      });
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < attempts)
      await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
}
throw new Error(
  `Deployment smoke did not pass after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
);
