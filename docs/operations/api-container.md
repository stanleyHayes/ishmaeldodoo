# API container operations

The NestJS API is built from the repository root so npm can resolve only the `@amanor/api` and `@amanor/contracts` workspaces. The final image contains compiled output and production dependencies, applies available Debian security updates, removes npm/Yarn/Corepack from the runtime, runs as the image's unprivileged `node` user, and exposes port 4000.

## Build and verify

```bash
docker build -f apps/api/Dockerfile -t amanor-api:<release> .
docker compose -f infra/docker-compose.test.yml up -d --wait
npm run test:api-container
npm run sbom:api -- amanor-api:verification artifacts/sbom/amanor-api.spdx.json
docker compose -f infra/docker-compose.test.yml down --volumes
```

The verifier requires the `infra_default` test network. It builds the image, starts it against authenticated MongoDB with bootstrap migrations disabled, waits for `/v1/health/ready`, rejects UID 0, sends SIGTERM with a ten-second bound, and requires exit code 0. The SBOM command emits a validated SPDX document. CI additionally fails on fixable high or critical image vulnerabilities and retains SPDX and SARIF evidence for 90 days.

## Release order

1. Build, scan, sign and publish the immutable image digest.
2. Back up MongoDB and run the one-shot migration job described in `docs/architecture/mongodb-migrations.md`.
3. Deploy the API with its restricted runtime `MONGODB_URI`, `RUN_MIGRATIONS=false`, and required production secrets.
4. Schedule the same immutable artifact's one-shot `retain` command daily with only the isolated MongoDB and Cloudinary retention classes, following `docs/operations/protocol-retention.md` and `docs/operations/media-retention.md`; do not put the job credentials in the frontend or API runtime deployments.
5. Require `/v1/health/live` for process liveness and `/v1/health/ready` for traffic readiness.
6. Configure a termination grace period of at least ten seconds. The container command runs Node directly, so SIGTERM reaches NestJS and its shutdown hooks without an intervening shell.
7. Roll back by immutable image digest only when the prior application remains compatible with the forward-only database shape.

Production promotion still requires image signing, registry retention rules, staging deployment, and rollback rehearsal.

Record the exact API digest beside the independently built Web and Admin/CMS
digests in the controlled
[image supply-chain acceptance record](../security/templates/image-supply-chain-acceptance-record.md).
The signature, provenance, SPDX and scan must all bind that same digest.
