# Provider-neutral deployment manifests

The controlled manifests under `infra/deployment/manifests/` define three independent release units: public Web, Admin/CMS and NestJS API. They are provider-neutral source contracts, not evidence that an environment exists.

Each selected hosting adapter must preserve:

- a distinct immutable image digest and origin for each release unit;
- the declared non-root UID, read-only root filesystem, port and health probes;
- bounded writable tmpfs mounts for `/tmp` and each Next.js cache path; no persistent container filesystem writes;
- independent promotion and rollback to the exact prior digest;
- no Admin/CMS secrets and only its two explicit public build values;
- Web-only service/revalidation custody and API-only backend/provider custody;
- migration and retention credentials in isolated, non-concurrent jobs, never the long-running API runtime;
- API graceful termination before the provider's 30-second deadline.

The registry hostname and digests in the committed files are deliberately reserved placeholders. The release pipeline must render an environment-specific copy using the built image digests and provider resource references. Do not edit a manifest to contain a credential, secret-manager value, credential-bearing URL or mutable image tag.

## Provider adaptation gate

After D01 and the hosting decision:

1. Map each release unit to a separately permissioned provider service and registry repository.
2. Map declared secret classes to provider secret references using the deployment secret inventory; do not copy values into the rendered manifest or evidence.
3. Configure public/protected origins, TLS, preview/staging access policy and indexing from the environment contract.
4. Render the selected provider configuration and compare its ports, probes, identity, job separation and rollback target to these manifests.
5. Deploy to staging, run the seven-check remote smoke, execute all three timed rollback paths and attach the reviewed release record.

`npm run check:deployment-manifests` detects contract drift locally. It does not validate a provider adapter or deployed state.
