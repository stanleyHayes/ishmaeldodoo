import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const allowedBaselineKinds = new Set(["measured", "approved_forecast"]);
const safePublicMethods = new Set(["GET", "HEAD"]);

function assertUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(`${label} must be a credential-free HTTPS URL`);
  return url;
}

export function validateLoadPlan(plan) {
  if (plan?.schemaVersion !== 1 || plan.environment !== "staging")
    throw new Error(
      "Load rehearsal accepts only schema-version-1 staging plans",
    );
  const origin = assertUrl(plan.origin, "origin");
  const productionOrigin = assertUrl(plan.productionOrigin, "productionOrigin");
  if (origin.origin === productionOrigin.origin)
    throw new Error("Load rehearsal origin must not be the production origin");
  if (!plan.productionLike || plan.allowProduction === true)
    throw new Error(
      "Load rehearsal requires production-like staging and forbids production",
    );
  const baseline = plan.baseline;
  if (
    !allowedBaselineKinds.has(baseline?.kind) ||
    !Number.isInteger(baseline.requestsPerSecond) ||
    baseline.requestsPerSecond < 1 ||
    typeof baseline.sourceReference !== "string" ||
    baseline.sourceReference.trim().length < 3 ||
    Number.isNaN(Date.parse(baseline.observedAt))
  )
    throw new Error(
      "A dated measured or approved-forecast baseline is required",
    );
  if (
    !Number.isInteger(plan.surge?.multiplier) ||
    plan.surge.multiplier !== 100 ||
    plan.surge.requestsPerSecond !== baseline.requestsPerSecond * 100
  )
    throw new Error("Surge traffic must equal exactly 100x baseline");
  if (
    !Number.isInteger(plan.surge.durationSeconds) ||
    plan.surge.durationSeconds < 60 ||
    plan.surge.durationSeconds > 1_800 ||
    plan.surge.requestsPerSecond > 2_000
  )
    throw new Error(
      "Surge duration or request rate is outside rehearsal bounds",
    );
  if (!Array.isArray(plan.traffic) || plan.traffic.length < 2)
    throw new Error("A representative public traffic mix is required");
  const weight = plan.traffic.reduce((sum, route) => {
    if (
      !safePublicMethods.has(route.method) ||
      typeof route.path !== "string" ||
      !route.path.startsWith("/") ||
      route.path.startsWith("//") ||
      !Number.isInteger(route.weightPercent) ||
      route.weightPercent < 1
    )
      throw new Error(
        "Public load routes must be safe weighted relative paths",
      );
    const target = new URL(route.path, origin);
    if (target.origin !== origin.origin)
      throw new Error("Public load routes must stay on the staging origin");
    return sum + route.weightPercent;
  }, 0);
  if (weight !== 100) throw new Error("Public traffic weights must total 100");
  if (
    plan.protocolDesk?.method !== "POST" ||
    plan.protocolDesk.path !== "/api/protocol-desk" ||
    !Number.isInteger(plan.protocolDesk.intervalSeconds) ||
    plan.protocolDesk.intervalSeconds < 30 ||
    plan.protocolDesk.intervalSeconds > 300
  )
    throw new Error(
      "Protocol Desk functional probes must use the bounded web route",
    );
  if (
    plan.protocolDesk.fixtureClassification !== "synthetic-no-real-person" ||
    plan.protocolDesk.cleanupOwner?.trim().length < 2
  )
    throw new Error(
      "Protocol Desk probes require synthetic classification and cleanup ownership",
    );
  for (const name of [
    "errorRatePercent",
    "publicP95Milliseconds",
    "protocolP95Milliseconds",
    "protocolSuccessPercent",
  ]) {
    const value = plan.thresholds?.[name];
    if (typeof value !== "number" || value < 0)
      throw new Error(`Invalid load threshold ${name}`);
  }
  if (
    plan.thresholds.errorRatePercent > 1 ||
    plan.thresholds.publicP95Milliseconds > 1_800 ||
    plan.thresholds.protocolP95Milliseconds > 15_000 ||
    plan.thresholds.protocolSuccessPercent !== 100
  )
    throw new Error("Load thresholds are weaker than Project AMANOR gates");
  return plan;
}

function percentile(values, percent) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil((percent / 100) * ordered.length) - 1];
}

function syntheticProtocolRequest(sequence) {
  const suffix = String(sequence).padStart(4, "0");
  return {
    locale: sequence % 2 === 0 ? "fr-FR" : "en-GB",
    capacity: "personal",
    organisation: {
      name: `AMANOR synthetic load rehearsal ${suffix}`,
      type: "academic",
      country: "gh",
    },
    requester: {
      name: `Synthetic Requester ${suffix}`,
      role: "Automated staging probe",
      email: `amanor-load-${suffix}@example.test`,
    },
    engagement: {
      type: "academic",
      eventName: `Synthetic capacity rehearsal ${suffix}`,
      startsAt: "2030-01-15T09:00:00.000Z",
      city: "Accra",
      country: "gh",
      format: "virtual",
      language: sequence % 2 === 0 ? "french" : "english",
      audienceSize: 25,
      audienceDescription:
        "Synthetic staging audience for capacity verification only",
    },
    ask: {
      proposedTheme: "Synthetic capacity verification",
      objective:
        "Verify that Protocol Desk remains functional during an approved staging load rehearsal.",
      recording: false,
    },
    logistics: {
      travel: "not_covered",
      honorarium: "not_offered",
      invitationLetter: false,
      visaLetter: false,
      governmentProtocol: false,
      otherPrincipals: false,
      contactName: "Synthetic Load Operator",
      contactPhone: "+233200000000",
    },
    consent: {
      dataProcessing: true,
      authorityToInvite: true,
      version: "staging-load-v1",
    },
  };
}

export async function executeLoadStage(plan, options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => performance.now());
  const sleep =
    options.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const authorization = options.authorization;
  if (!authorization) throw new Error("Staging edge authorization is required");
  const publicLatencies = [];
  const protocolLatencies = [];
  const references = [];
  let publicFailures = 0;
  let protocolFailures = 0;
  const slots = plan.traffic.flatMap((route) =>
    Array.from({ length: route.weightPercent }, () => route),
  );
  const startedAt = new Date().toISOString();
  for (let second = 0; second < plan.surge.durationSeconds; second += 1) {
    const tick = now();
    const requests = Array.from(
      { length: plan.surge.requestsPerSecond },
      async (_, index) => {
        const route =
          slots[(second * plan.surge.requestsPerSecond + index) % 100];
        const requestStarted = now();
        try {
          const response = await fetcher(new URL(route.path, plan.origin), {
            method: route.method,
            headers: {
              Authorization: authorization,
              "User-Agent": "amanor-load-rehearsal/1",
            },
            redirect: "manual",
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) publicFailures += 1;
        } catch {
          publicFailures += 1;
        } finally {
          publicLatencies.push(now() - requestStarted);
        }
      },
    );
    if (second % plan.protocolDesk.intervalSeconds === 0) {
      requests.push(
        (async () => {
          const requestStarted = now();
          try {
            const response = await fetcher(
              new URL(plan.protocolDesk.path, plan.origin),
              {
                method: "POST",
                headers: {
                  Authorization: authorization,
                  "Content-Type": "application/json",
                  "User-Agent": "amanor-load-rehearsal/1",
                },
                body: JSON.stringify(
                  syntheticProtocolRequest(protocolLatencies.length + 1),
                ),
                signal: AbortSignal.timeout(20_000),
              },
            );
            const body = await response.json().catch(() => ({}));
            if (
              response.status !== 202 ||
              !/^PD-\d{4}-\d{4,}$/u.test(body.reference)
            )
              protocolFailures += 1;
            else references.push(body.reference);
          } catch {
            protocolFailures += 1;
          } finally {
            protocolLatencies.push(now() - requestStarted);
          }
        })(),
      );
    }
    await Promise.all(requests);
    const remaining = 1_000 - (now() - tick);
    if (remaining > 0) await sleep(remaining);
  }
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    public: {
      requests: publicLatencies.length,
      failures: publicFailures,
      p95Milliseconds: percentile(publicLatencies, 95),
    },
    protocolDesk: {
      requests: protocolLatencies.length,
      failures: protocolFailures,
      p95Milliseconds: percentile(protocolLatencies, 95),
      references,
    },
  };
}

export async function runLoadRehearsal(planInput, options = {}) {
  const plan = validateLoadPlan(planInput);
  const result = await (options.execute ?? executeLoadStage)(plan, options);
  const expectedPublic =
    plan.surge.requestsPerSecond * plan.surge.durationSeconds;
  const expectedProtocol = Math.ceil(
    plan.surge.durationSeconds / plan.protocolDesk.intervalSeconds,
  );
  if (result.public.requests !== expectedPublic)
    throw new Error(
      "Load runner did not execute the declared public request count",
    );
  if (result.protocolDesk.requests !== expectedProtocol)
    throw new Error(
      "Load runner did not execute the declared Protocol Desk probes",
    );
  const publicErrorRate =
    (result.public.failures / result.public.requests) * 100;
  const elapsedSeconds =
    (Date.parse(result.finishedAt) - Date.parse(result.startedAt)) / 1_000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0)
    throw new Error("Load runner produced an invalid execution window");
  const achievedRequestsPerSecond = result.public.requests / elapsedSeconds;
  const protocolSuccess =
    ((result.protocolDesk.requests - result.protocolDesk.failures) /
      result.protocolDesk.requests) *
    100;
  const checks = {
    exactRequestCount: result.public.requests === expectedPublic,
    achievedRequestRate:
      achievedRequestsPerSecond >= plan.surge.requestsPerSecond * 0.98,
    publicErrorRate: publicErrorRate <= plan.thresholds.errorRatePercent,
    publicP95:
      result.public.p95Milliseconds <= plan.thresholds.publicP95Milliseconds,
    protocolSuccess:
      protocolSuccess >= plan.thresholds.protocolSuccessPercent &&
      result.protocolDesk.references.length === result.protocolDesk.requests,
    protocolP95:
      result.protocolDesk.p95Milliseconds <=
      plan.thresholds.protocolP95Milliseconds,
  };
  if (Object.values(checks).some((passed) => !passed))
    throw new Error("Load rehearsal failed one or more declared thresholds");
  return {
    schemaVersion: 1,
    status: "passed",
    environment: plan.environment,
    baseline: plan.baseline,
    surge: plan.surge,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    public: {
      ...result.public,
      errorRatePercent: publicErrorRate,
      achievedRequestsPerSecond,
    },
    protocolDesk: {
      ...result.protocolDesk,
      successPercent: protocolSuccess,
    },
    checks,
  };
}

async function main() {
  const planPath = process.argv[2];
  if (!planPath)
    throw new Error("Usage: node scripts/load-rehearsal.mjs <plan.json>");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const result = await runLoadRehearsal(plan, {
    authorization: process.env.LOAD_TEST_AUTHORIZATION,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Load rehearsal failed"}\n`,
    );
    process.exitCode = 1;
  });
