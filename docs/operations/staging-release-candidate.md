# Staging and release-candidate process

- Status: Provider-neutral process ready; first deployed candidate not run
- Scope: AMANOR-029, AMANOR-141, AMANOR-145 and AMANOR-147
- Environment contract: `infra/deployment/environment-contract.json`
- Secret inventory: `infra/deployment/secret-inventory.json`
- Smoke command: `npm run smoke:deployment`
- Rollback command: `npm run rehearse:rollback -- <provider-plan.json>`
- Provider-plan template: `infra/deployment/rollback-plan.example.json`
- Load command: `npm run rehearse:load -- <load-plan.json>`
- Load-plan template: `infra/deployment/load-plan.template.json`
- Repository governance: [GitHub repository governance](github-repository-governance.md)

The public Next.js web, protected Next.js Admin/CMS and NestJS API are three releases with distinct origins, credentials, build artifacts, logs and rollback controls. A shared source revision does not make them one deployment. Content publication remains independent from code promotion.

The active GitHub ruleset protects `main` from deletion and non-fast-forward
history changes without changing the current direct fast-forward delivery
model. It does not make post-push CI a pre-merge gate. Required checks and
review enforcement remain pending the controlled workflow transition in the
repository-governance record.

GitHub `preview`, `staging` and `production` namespaces exist, with staging and
production limited to protected branches. No deployment workflow, secret,
reviewer or provider resource is bound to them yet; complete the controlled
deployment-environment integration record before treating them as provisioned.

## Candidate entry criteria

- Immutable source revision and dependency lockfile recorded; no uncommitted candidate changes.
- One approving review and hosted green pipeline, including unit/integration/browser/accessibility/Lighthouse/security/container gates.
- Release notes, known limitations and migration IDs reviewed.
- Staging web/Admin/API origins and isolated MongoDB, Cloudinary, email, analytics and monitoring resources recorded without secrets.
- Preview/staging edge authentication, global noindex and access list verified from an unauthenticated and authorised client.
- High/critical defects are zero; accepted lower risks have an owner, date and approval.

## Deployment order

1. Snapshot provider/release state and confirm rollback targets for each deployable.
2. Run the separately credentialed, forward-only migration job against staging; record checksum, start/end and idempotent re-run evidence.
3. Deploy the API revision without bootstrap migration permission. Wait for liveness and dependency readiness.
4. Deploy Admin/CMS with only its public API origin build setting. Verify noindex/no-store before operator login.
5. Deploy public web with indexing disabled, staging API/service credentials and staging-only integrations.
6. Publish only synthetic approved staging content through the CMS; do not clone production personal/confidential data.
7. Run remote smoke, full browser journeys, accessibility, Lighthouse, security and release-specific drills.
8. Execute the approved [100x load rehearsal](load-rehearsal.md) only after smoke and observability pass; attach its signed record and synthetic-data cleanup evidence.

## Smoke and evidence

Set `AMANOR_SMOKE_ENVIRONMENT`, `AMANOR_SMOKE_WEB_URL`, `AMANOR_SMOKE_ADMIN_URL` and `AMANOR_SMOKE_API_URL`. If the approved edge uses an authorisation header, provide it only through `AMANOR_SMOKE_EDGE_AUTHORIZATION`; command output never includes it. HTTP is permitted only for the internal test fixture.

The smoke runner proves three distinct origins; English, French and Atlas-table public paths; preview/staging noindex or production sitemap/indexing state; frontend security headers; Admin noindex/no-store; and API live/ready request correlation. Save its JSON output with the [release candidate record](templates/release-candidate-record.md). It is a smoke check, not UAT, penetration testing or production proof.

While staging has not been provisioned, `npm run check:release` binds the
release-candidate record's exact pending entry, artifact, migration, smoke,
rollback and authority fields. One unrelated `Not run` value cannot conceal a
premature candidate or promotion claim. Before the first real candidate,
extend the validator in the same reviewed change to require immutable provider
identifiers, durable evidence references and the complete approval set; do not
delete the pending-state checks without replacing them with executed-state
validation.

## Independent rollback

- API rollback selects the prior immutable image/config while leaving forward migrations intact; use a reviewed forward repair when schema compatibility is lost.
- Admin rollback selects its prior artifact without changing public web or API state.
- Public-web rollback selects its prior artifact; bad content uses CMS unpublish/rollback and signed revalidation rather than a code deployment.
- A rollback rehearsal must time each path independently, verify API readiness/Admin access/public cache state and record which dependent jobs were paused or replayed.
- Never overwrite the affected database or erase investigation evidence to make a rollback appear successful.

The rehearsal plan contains only non-secret origins, immutable candidate/rollback identifiers and provider CLI argument arrays. Credentials belong in the provider CLI's workload identity or environment, never the JSON plan. The harness rejects secret-like command arguments, shell execution, duplicate/out-of-order deployables, credential-bearing URLs, mutable/equal release identifiers and deadlines above 900 seconds.

The harness runs API, Admin and Web independently in that order. It pauses API-dependent jobs before the API rollback, verifies the provider reports the exact declared prior release, executes the complete deployment smoke after each rollback and resumes jobs even when provider verification or smoke fails. It emits evidence only after every path passes within the deadline; command arguments and provider output are never written to the evidence JSON. Replace the example commands with the selected hosting provider's non-interactive CLI and test its workload identity before the timed exercise.

## Promotion decision

QA prepares the record; Product, Engineering and Security approve staging exit, with Privacy/Content/Principal approval where their gates apply. Production receives the exact reviewed artifacts and migration set—no rebuild with different dependencies. Promotion remains blocked until required content, French parity, external accessibility/security review, provider delivery, load, UAT and Principal lifecycle evidence are signed.

After production promotion, indexing is enabled only through the explicit production setting and a fresh smoke proves robots/sitemap behavior. Monitor independent web/Admin/API health, Desk delivery/SLA, errors and rollback watch for the approved window.
