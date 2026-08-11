import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { runDeploymentSmoke } from "./smoke-deployment.mjs";

const deployableOrder = ["api", "admin", "web"];
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const unsafeArgumentPattern =
  /(?:authorization|password|passwd|secret|token|api[_-]?key|mongodb(?:\+srv)?:\/\/[^/\s]+@)/iu;

function command(value, label) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 20 ||
    value.some(
      (part) =>
        typeof part !== "string" ||
        part.length < 1 ||
        part.length > 512 ||
        unsafeArgumentPattern.test(part),
    )
  )
    throw new Error(`${label} must be a bounded argv array without secrets`);
  return value;
}

function validatePlan(plan) {
  if (
    plan?.schemaVersion !== 1 ||
    plan.environment !== "staging" ||
    !Number.isInteger(plan.maximumSeconds) ||
    plan.maximumSeconds < 1 ||
    plan.maximumSeconds > 900
  )
    throw new Error(
      "Rollback plan must be a version 1 staging plan within 15 minutes",
    );
  for (const [key, label] of [
    [plan.webUrl, "Public web URL"],
    [plan.adminUrl, "Admin URL"],
    [plan.apiUrl, "API URL"],
  ]) {
    const url = new URL(key);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error(`${label} must be credential-free HTTPS`);
  }
  if (
    !Array.isArray(plan.deployables) ||
    plan.deployables.length !== deployableOrder.length ||
    plan.deployables.some(
      (entry, index) => entry?.name !== deployableOrder[index],
    )
  )
    throw new Error("Rollback order must be api, admin, web exactly once");

  return {
    ...plan,
    deployables: plan.deployables.map((entry) => {
      if (
        !identifierPattern.test(entry.candidateRelease) ||
        !identifierPattern.test(entry.rollbackTarget) ||
        entry.candidateRelease === entry.rollbackTarget
      )
        throw new Error(`${entry.name} releases must be distinct identifiers`);
      const normalized = {
        ...entry,
        rollbackCommand: command(
          entry.rollbackCommand,
          `${entry.name} rollbackCommand`,
        ),
        verifyCommand: command(
          entry.verifyCommand,
          `${entry.name} verifyCommand`,
        ),
      };
      if (entry.name === "api") {
        normalized.pauseJobsCommand = command(
          entry.pauseJobsCommand,
          "api pauseJobsCommand",
        );
        normalized.resumeJobsCommand = command(
          entry.resumeJobsCommand,
          "api resumeJobsCommand",
        );
      }
      return normalized;
    }),
  };
}

async function executeCommand(argv, label, timeoutMilliseconds) {
  const [executable, ...args] = argv;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMilliseconds,
      killSignal: "SIGTERM",
      env: process.env,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      if (stdout.length <= 65_536) stdout += chunk.toString();
    });
    child.on("error", () => reject(new Error(`${label} failed to start`)));
    child.on("close", (code, signal) => {
      if (code !== 0)
        reject(
          new Error(
            `${label} failed${signal ? " or exceeded its deadline" : ""}`,
          ),
        );
      else resolve(stdout.trim());
    });
  });
}

export async function runRollbackRehearsal(planInput, dependencies = {}) {
  const plan = validatePlan(planInput);
  const execute = dependencies.execute ?? executeCommand;
  const smoke = dependencies.smoke ?? runDeploymentSmoke;
  const clock = dependencies.clock ?? Date.now;
  const checkedAt = dependencies.checkedAt ?? (() => new Date().toISOString());
  const startedAt = clock();
  const deadline = startedAt + plan.maximumSeconds * 1_000;
  const results = [];

  for (const entry of plan.deployables) {
    const stepStartedAt = clock();
    let jobsPaused = false;
    try {
      if (entry.name === "api") {
        await execute(
          entry.pauseJobsCommand,
          "API dependent-job pause",
          Math.max(1, deadline - clock()),
        );
        jobsPaused = true;
      }
      await execute(
        entry.rollbackCommand,
        `${entry.name} rollback`,
        Math.max(1, deadline - clock()),
      );
      const observedRelease = await execute(
        entry.verifyCommand,
        `${entry.name} release verification`,
        Math.max(1, deadline - clock()),
      );
      if (observedRelease !== entry.rollbackTarget)
        throw new Error(
          `${entry.name} did not select its declared rollback target`,
        );

      const smokeResult = await smoke({
        environment: "staging",
        webUrl: plan.webUrl,
        adminUrl: plan.adminUrl,
        apiUrl: plan.apiUrl,
        edgeAuthorization: dependencies.edgeAuthorization,
        allowHttp: dependencies.allowHttp === true,
      });
      if (entry.name === "api") {
        await execute(
          entry.resumeJobsCommand,
          "API dependent-job resume",
          Math.max(1, deadline - clock()),
        );
        jobsPaused = false;
      }
      const stepEndedAt = clock();
      if (stepEndedAt > deadline)
        throw new Error("Rollback rehearsal exceeded the 15-minute deadline");
      results.push({
        deployable: entry.name,
        candidateRelease: entry.candidateRelease,
        rollbackTarget: entry.rollbackTarget,
        durationMilliseconds: stepEndedAt - stepStartedAt,
        providerStateVerified: true,
        smokeChecks: smokeResult.checks,
        dependentJobs:
          entry.name === "api" ? "paused_and_resumed" : "unchanged",
      });
    } finally {
      if (entry.name === "api" && jobsPaused)
        await execute(
          entry.resumeJobsCommand,
          "API dependent-job resume",
          Math.max(1, deadline - clock()),
        );
    }
  }

  const completedAt = clock();
  if (completedAt > deadline)
    throw new Error("Rollback rehearsal exceeded the 15-minute deadline");
  return {
    schemaVersion: 1,
    environment: "staging",
    checkedAt: checkedAt(),
    maximumSeconds: plan.maximumSeconds,
    durationMilliseconds: completedAt - startedAt,
    status: "passed",
    results,
  };
}

async function main() {
  const planPath = process.argv[2];
  if (!planPath)
    throw new Error("Usage: rollback-rehearsal.mjs <rollback-plan.json>");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const result = await runRollbackRehearsal(plan, {
    edgeAuthorization: process.env.AMANOR_SMOKE_EDGE_AUTHORIZATION,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
