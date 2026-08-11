# Project AMANOR

Project AMANOR is the bilingual personal authority platform for Dr. Ishmael Nii Amanor Dodoo. The founding specification is `Project_AMANOR_Website_Build_Brief.pdf`; delivery status and dependencies live in `agent_plan.md`.

## Confirmed stack

- Next.js 16 public frontend in `apps/web`
- Separate Next.js 16 admin/CMS in `apps/admin`
- NestJS backend in `apps/api`
- First-party CMS domain and MongoDB/Mongoose persistence owned by NestJS
- Custom JWT authentication issued and enforced by NestJS
- Cloudinary media management
- Leaflet maps
- Tailwind CSS with a bespoke public design system

## Local setup

1. Install Node.js 22 or newer.
2. Copy the `.env.example` inside each application to its local environment file.
3. Run `npm install`.
4. Run an application independently:
   - `npm run dev --workspace @amanor/web`
   - `npm run dev --workspace @amanor/admin`
   - `npm run dev --workspace @amanor/api`

Do not use production credentials locally. The foundation page remains `noindex` until launch controls, canonical identity data, and approved content are in place.

## Quality commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run check`

The root `check` command enforces frontend/backend dependency boundaries and then verifies every workspace independently.

## Operations and handover

Start with the [handover package](docs/handover/README.md) for role-oriented CMS, Protocol Desk, security, deployment and training guidance. Its unchecked evidence items are launch gates, not optional suggestions.

## Delivery workflow

Before editing, claim a bounded task and reserved paths in `agent_plan.md`. Use branches named `feature/AMANOR-<id>-<slug>`, keep changes focused, and attach verification evidence before changing a task to `DONE`.

Never commit credentials, personal data, unpublished policy material, production database exports, or confidential enquiries.
