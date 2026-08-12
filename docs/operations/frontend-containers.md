# Frontend container operations

The public website and Admin/CMS are separate Next.js 16 standalone images. Neither image contains the NestJS API, MongoDB credentials, Mongoose, or backend secrets.

## Build and verify

```bash
docker build -f apps/web/Dockerfile -t amanor-web:<release> .
docker build \
  -f apps/admin/Dockerfile \
  --build-arg NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV=production \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.test/v1 \
  -t amanor-admin:<release> .
npm run test:frontend-containers
```

The verifier builds and starts both images independently, checks their HTTP boundaries, rejects UID 0, and requires a bounded SIGTERM exit. The public image serves on port 3000. The Admin/CMS image serves on port 3001, is always `noindex`, and returns private `no-store` responses.

## Environment boundary

`apps/web` resolves its API origin at runtime from the public-web environment. The exact production variable is validated by that application's environment schema.

Set `AMANOR_DEPLOYMENT_ENV=production` in the real public-web deployment. This is deliberately separate from Next.js `NODE_ENV=production`, which is also used for reproducible local and CI builds; the deployment flag activates fail-closed validation for service and revalidation credentials.

`NEXT_PUBLIC_AMANOR_DEPLOYMENT_ENV` and `NEXT_PUBLIC_API_BASE_URL` are compiled into the Admin/CMS browser bundle. Supply both as Docker build arguments for the target environment; changing either requires rebuilding the admin image. Preview, staging and production require an absolute, credential-free, non-loopback HTTPS API URL ending exactly in `/v1`. The same parser governs Next.js CSP generation and both Admin API clients, so invalid configuration fails the build or first client access without a localhost fallback. Do not place credentials or secrets in any `NEXT_PUBLIC_*` value.

API-only secrets belong only to the independently deployed NestJS service. In particular, MongoDB, JWT signing, refresh-token, Cloudinary signing, email, and migration credentials must never be supplied to either frontend image.

## Independent release and rollback

1. Build, scan, sign, and publish each image under its own immutable digest.
2. Deploy the API first when a release introduces backward-compatible endpoints required by a frontend.
3. Deploy public web and Admin/CMS independently after their own checks pass.
4. Route public web, admin, and API through separate origins and health probes.
5. Roll back only the affected image by digest. Keep API contracts backward compatible for at least the active and previous frontend revisions.

CI exercises both runtime images, generates separate SPDX SBOMs, fails on fixable high or critical vulnerabilities, and retains SBOM/SARIF evidence for 90 days. Registry publication, environment provisioning, signing, and a staging rollback rehearsal remain hosting-dependent release gates.

Complete those hosting-dependent gates for Web, Admin/CMS and API together in
the controlled
[image supply-chain acceptance record](../security/templates/image-supply-chain-acceptance-record.md).
