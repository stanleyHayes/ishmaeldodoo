# Agent operating rules

Read `agent_plan.md` and the relevant section of `Project_AMANOR_Website_Build_Brief.pdf` before changing the project.

## Coordination

- Claim one bounded task in `agent_plan.md` before editing. Record owner, branch, reserved paths, start date, and last update.
- Do not edit another owner's reserved paths without an explicit handoff.
- Preserve unrelated changes. Never mark work complete without current verification evidence.
- Update the task row, active reservation, blockers, and verification log when handing off or completing work.

## Product invariants

- The site is independent and must never appear to be an official government website.
- `en-GB` and `fr-FR` ship at parity. Never silently serve stale French content.
- Every public claim is source-linked. Canonical identity fields render from the versioned registry, never hard-coded strings.
- Public-office capacity rules, two-person publishing, consent, privacy, low-bandwidth access, and WCAG 2.2 AA are launch requirements.
- The Room is a distinct encrypted confidential channel and is not a procurement channel.
- Doctrine content must be retrieval-grounded, cited, logged, reviewable, and explicitly authorised before release.

## Engineering

- Use strict TypeScript and validate all untrusted input at runtime.
- Keep browser, application, domain, and infrastructure concerns separated.
- Treat `apps/web`, `apps/admin`, and `apps/api` as independent deployables. Only `apps/api` may import Mongoose, backend repositories, NestJS modules or backend-only secrets.
- Share contracts through `packages/contracts`; never import source across application directories.
- Access MongoDB through bounded repositories and explicit Mongoose schemas. Add forward-only migrations for persisted shape changes.
- JWT access tokens are short-lived. Refresh tokens rotate, are stored only in secure HttpOnly cookies, are hashed in server-side sessions, and are immediately revocable.
- Never expose secrets or sensitive data in source, client bundles, URLs, analytics, or logs.
- Respect the performance and accessibility budgets in `agent_plan.md`.

## Required checks

Run checks proportionate to the change, with `npm run check` as the full local application gate. Interactive flows also require browser and assistive-technology evidence described in the plan.
