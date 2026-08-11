# ADR-001: Separate Next.js 16 public and admin applications

- Status: Accepted technical baseline; provider configuration pending
- Date: 9 August 2026

## Decision

Use two independently deployed Next.js 16 App Router applications with strict TypeScript. `apps/web` serves the public platform and prefers Server Components/static generation. `apps/admin` serves the protected CMS/operations console and consumes the NestJS API. Neither application imports Mongoose, repositories or backend business logic.

The NestJS API owns dynamic business workflows. A signed backend webhook triggers narrow `apps/web` tag revalidation after publication. Admin preview uses authenticated API responses and never makes drafts publicly cacheable. Confidential or personalised responses are `private, no-store`.

## Consequences

- Public content remains fast and resilient while the separately deployed API owns Desk, CMS, Room and auth behaviour.
- Only NestJS owns database/provider access. Automated boundary checks prevent frontend imports.
- Public content fetches use published projections, never draft collections.
- The build starts `noindex`; launch indexing is an explicit release change.
- Web and admin have isolated environment schemas, build artifacts, releases, logs and rollback paths.
- Exact runtime/package versions are pinned and upgraded through reviewed dependency changes.

## Verification

Static/dynamic route inspection, cache/revalidation integration tests, preview isolation tests, client bundle analysis, Lighthouse budgets and protected-preview checks are required.
