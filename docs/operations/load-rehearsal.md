# 100x load and Protocol Desk rehearsal

- Scope: AMANOR-141
- Automation status: implemented and root-gated
- Acceptance status: not run against production-like staging

## Evidence boundary

The brief requires the platform to survive a hundredfold news-event spike without degrading Protocol Desk. A local or mocked pass is not capacity evidence. Acceptance requires a dated measured traffic baseline or a launch forecast formally approved by Product and Operations, a production-like staging deployment, an executed report, infrastructure graphs and signatures from Operations, Product and Security.

The committed plan is intentionally invalid. Copy `infra/deployment/load-plan.template.json` into the controlled release workspace, replace its pending baseline with `measured` or `approved_forecast` evidence, set the exact target to baseline requests/second multiplied by 100, assign the synthetic-data cleanup owner and record both the real staging and production origins. The runner rejects equal origins. Never weaken the committed thresholds.

## Safety preflight

1. Confirm the origin is isolated, protected, noindex staging—not production or preview.
2. Confirm staging uses production topology, limits and representative synthetic content without copied production personal data.
3. Approve the baseline source, 15-minute surge window, traffic cost and provider quotas.
4. Confirm observability, rollback, incident owner and an abort operator are active.
5. Confirm the Protocol Desk fixture routes to non-delivering staging adapters. It uses only `example.test` identities and must never trigger a real institutional mailbox.
6. Confirm the cleanup owner can identify the returned `PD-*` references and remove or quarantine the synthetic records after evidence capture under the staging data policy.
7. Supply edge authentication only through `LOAD_TEST_AUTHORIZATION`; never place it in the plan, shell history, report or logs.

## Execution

```bash
LOAD_TEST_AUTHORIZATION='provided-by-the-secret-runner' npm run rehearse:load -- /controlled/path/load-plan.json > /controlled/path/load-result.json
```

The runner permits credential-free HTTPS URLs only, `GET`/`HEAD` bulk traffic, a maximum 2,000 requests/second, a 60–1,800 second surge and the same-origin public traffic mix. It sends one bounded synthetic Protocol Desk request every 30–300 seconds while bulk traffic is active. It never places Protocol Desk submissions into the bulk pool or bypasses the application rate limiter.

Passing evidence requires all of the following:

- the exact declared public request count;
- achieved request rate of at least 98% of the declared 100x target for the recorded window;
- public error rate no more than 1%;
- public p95 latency no more than 1,800 ms;
- 100% of Protocol Desk probes return HTTP 202 and a valid unpredictable reference;
- Protocol Desk p95 latency no more than 15 seconds.

A thrown error or interrupted process is not a pass. Capture provider graphs for API/Web saturation, MongoDB connections/latency, queue depth, error rate and edge behavior for the identical window. The JSON result does not contain the edge credential or submitted bodies, but its Protocol Desk references are restricted operational evidence.

## Completion and cleanup

Stop immediately on data leakage, real email delivery, sustained threshold breach, provider distress or loss of observability. After the run, verify a sampled synthetic request remains usable through the protected Desk workflow, quarantine/delete every returned synthetic reference, confirm normal queues and alerts recover, and attach the completed record from `docs/operations/templates/load-rehearsal-record.md`. AMANOR-141 remains in progress until the record and provider graphs are signed.

Until production-like staging exists, `npm run check:load` binds every pending
baseline, plan, result, graph, Protocol Desk, cleanup and approval field in the
record. A single leftover placeholder cannot conceal a premature passing claim.
Before the first real rehearsal, extend the validator in the same reviewed
change to verify the plan/result checksums, immutable staging revisions, durable
graph and cleanup references, and separate Operations, Product and Security
approvals; never replace the pending-state guard with an unstructured status
string.
