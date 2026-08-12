# Render and Vercel deployment preparation

- Status: provider adapters complete; accounts, domains, secrets and first deployments not yet provisioned
- Repository: `stanleyHayes/ishmaeldodoo`
- Render adapter: `render.yaml`
- Vercel adapters: `apps/web/vercel.json` and `apps/admin/vercel.json`

The three applications remain separate release units. Render runs only the NestJS API and the isolated retention cron. Vercel uses two projects for the public Web and Admin/CMS. MongoDB remains an external MongoDB service; Render does not substitute PostgreSQL for it.

## Render Blueprint

Create a Blueprint from the repository-root `render.yaml`. It provisions:

- `amanor-api`: Docker Web Service in Frankfurt, built from `apps/api/Dockerfile`, with readiness at `/v1/health/ready`, a 30-second graceful shutdown window and `RUN_MIGRATIONS=false`;
- `amanor-retention`: separate daily Docker cron running `node apps/api/dist/retention.js` with only its MongoDB and Cloudinary retention credentials.

The Blueprint prompts for every `sync: false` value on first creation. Never put values into `render.yaml`. Use a production MongoDB replica-set URI with TLS and least-privilege application grants for `MONGODB_URI`. The long-running API intentionally receives neither `MONGODB_MIGRATION_URI` nor retention credentials.

The API image installs system Chromium for governed Press Kit, Living Dossier and Protocol Note PDF generation. It continues to run as the non-root `node` user. `CHROME_NO_SANDBOX=true` is limited to the Render container boundary and must be revisited if Render exposes a supported Chromium sandbox.

### Trusted proxy and client-IP acceptance

Render's public load balancer is the only network hop that can reach the service's bound public port, so the Blueprint fixes `TRUST_PROXY_HOPS=1`. Do not increase it for a Cloudflare/custom-domain layer without a captured provider path proving that Render exposes an additional trusted address to Express. The provider-adapter gate rejects a missing, zero or multi-hop Render value; local direct HTTP remains at the API default of zero trusted hops.

Before staging acceptance, prove both preservation and spoof resistance against the deployed API:

1. From one controlled source address, send 31 invalid login requests with unique valid-looking email addresses and 31 varied spoofed `X-Forwarded-For` values. Request 31 must return `429` with a bounded `Retry-After`; changing the supplied header must not reset the IP bucket.
2. Repeat from a second controlled source address after clearing the dedicated staging limiter collection. Its first request must receive a fresh allowance, proving distinct real clients are not collapsed into the proxy address.
3. Repeat through the final custom/Cloudflare hostname and the direct `onrender.com` hostname. Both paths must produce the same result before the direct hostname is restricted at the edge; otherwise stop launch and correct the trust topology.
4. Retain only timestamps, path label, response status, remaining count and `Retry-After`. Do not retain raw source addresses, spoof values, submitted emails, cookies or authorization data.

This drill validates the provider path; local unit tests and a configured hop count do not. Keep Cloudflare WAF enforcement external to the application rate limit so neither control silently substitutes for the other.

Capture the trusted-proxy proof together with the wider WAF/bot/abuse exercise
in the controlled
[`edge-abuse-rehearsal-record.md`](../security/templates/edge-abuse-rehearsal-record.md).

### Migration promotion gate

Create a separate MongoDB migration identity and store `MONGODB_MIGRATION_URI` only in the protected release environment that executes:

```sh
npm ci --ignore-scripts
npm run build --workspace @amanor/contracts
npm run build --workspace @amanor/api
npm run migrate --workspace @amanor/api
```

Run this once for the exact commit after backup/recovery-point evidence and before manually promoting the matching Render API deploy. Do not add `preDeployCommand` with the migration URI: Render service environment variables remain available to the long-running service and would collapse the required credential boundary. For that reason the Render API service remains manually promoted even though GitHub CI is mandatory.

## Public Web on Vercel

Create a Vercel project from the GitHub repository with:

- Root Directory: `apps/web`
- Framework Preset: Next.js
- Include source files outside the Root Directory: enabled, so the npm workspace and `packages/contracts` are available
- Node.js: 24.x (Vercel's newest supported build and Functions runtime; minor and security patches roll forward automatically)
- Production Branch: `main`
- Deployment Protection: enabled for Preview; staging must also be protected and `PUBLIC_INDEXING_ENABLED=false`

Configure each environment separately. Required production settings are `PUBLIC_API_BASE_URL`, `AMANOR_DEPLOYMENT_ENV`, `PUBLIC_WEB_BASE_URL`, `REVALIDATION_WEBHOOK_KEYS`, `REVALIDATION_AUDIENCE`, `PUBLIC_SERVICE_KEY_ID`, `PUBLIC_SERVICE_SECRET`, `PUBLIC_SERVICE_AUDIENCE`, `PUBLIC_INDEXING_ENABLED`, `LEAFLET_TILE_URL` and `LEAFLET_TILE_ATTRIBUTION`. Configure analytics only after S04 approval. Configure Room trust-anchor build values only after its Security/Legal release gates.

`PUBLIC_API_BASE_URL` must be the Render API HTTPS origin ending in `/v1`. `PUBLIC_WEB_BASE_URL` must be the exact Vercel/custom origin for the current environment. The service-auth and revalidation key rings must match their API verification/signing counterparts without copying values into Git or build logs.

## Admin/CMS on Vercel

Create a second Vercel project from the same repository with:

- Root Directory: `apps/admin`
- Framework Preset: Next.js
- Include source files outside the Root Directory: enabled
- Node.js: 24.x (Vercel's newest supported build and Functions runtime; minor and security patches roll forward automatically)
- Production Branch: `main`
- Deployment Protection: enabled for every non-production deployment

Set only `NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV` and `NEXT_PUBLIC_API_BASE_URL`. The Admin application receives no secrets. The API URL must be the exact HTTPS Render origin ending in `/v1`; the same Admin origin must be supplied to Render as `ADMIN_ORIGIN` for credentialed CORS, Origin/CSRF enforcement and WebAuthn.

## Domain and cross-deployment order

The manually dispatched `Deploy separated applications` workflow accepts only
a full reviewed commit SHA. It requires successful hosted Quality and CodeQL
runs for that SHA plus an HTTPS migration/backup evidence reference. Render's
authenticated deploy API receives the SHA as `commitId`; Vercel deployments use
the Git-source API with both `ref` and `sha`. The workflow waits for the API to
be `live` at that SHA before starting Admin, and waits for Admin to be `READY`
before starting Web. It succeeds only after Web is `READY` at the same SHA and
the existing three-origin remote smoke passes. Provider acceptance is not
staging acceptance; retain all three deployment IDs and reconcile them in the
release record.

Vercel `preview` and `production` use the built-in targets. Persistent
`staging` requires a Vercel Pro/Enterprise custom environment named `staging`
on both frontend projects (or a separately reviewed branch-preview design).
The GitHub environment's `VERCEL_TARGET` must match its selected namespace.
Each successful run retains a 90-day redacted artifact with the exact source
SHA, exact successful canonical Quality and CodeQL `push`-to-`main` workflow
run identities/attempts, three provider deployment IDs/projects and terminal
states plus the remote smoke JSON. A
manifest binds the repository, workflow run/attempt, deployment environment,
exact SHA and HTTPS migration-evidence reference to SHA-256 digests of all
three JSON evidence files, preventing evidence from separate runs from being
mixed. Tokens, provider responses and hook URLs are never written.

1. Resolve D01 and provision the API, public Web and Admin domains.
2. Create separate MongoDB application, migration and retention users.
3. Create the Render Blueprint with WebAuthn and Room disabled.
4. Create both Vercel projects and environment-specific variables.
5. Replace Render `PUBLIC_WEB_ORIGIN`, `ADMIN_ORIGIN`, `WEB_REVALIDATION_URL` and `JWT_ISSUER` with the final HTTPS origins.
6. Run the isolated migration command, then manually promote the exact Render commit.
7. Deploy Admin and Web, run the seven-check remote smoke suite and verify credentialed Admin login from the exact origin.
8. Verify local-file Cloudinary ingestion end to end. Cloudinary uploads originate from local files through the Admin workflow; no profile or content image URL field may be introduced.
9. Enable WebAuthn only after RP, origin, authenticator and custody approval. Keep Room disabled until its separate cryptographic release gates pass.
10. Record immutable release identifiers, smoke output, rollback targets and approvals in the release-candidate record.

Provider dashboards and environment-variable evidence must contain names/status only, never secret values. A successful Blueprint sync or Vercel build is not staging acceptance until remote smoke, migrations, provider integrations, rollback and the required reviews pass.
