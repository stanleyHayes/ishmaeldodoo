# Project AMANOR decision workshop

- Controlled register: `decision-register.json`
- Status: Awaiting authorized stakeholders
- Scope: D01-D11 and S01-S07

This packet converts the unresolved launch decisions into one attributable record. It does not authorize Codex, an engineer or an unsigned meeting note to decide on behalf of the Principal, Legal, Privacy, Security, Product or Operations.

## How to decide

For each record, an authorized stakeholder must:

1. choose exactly one value already listed in `options`;
2. set `status` to `approved` or `deferred`;
3. explain the exact choice, names, domains, cadence, wording, scope or provider account in `decisionDetail` without recording credentials or personal contact details;
4. replace `approvals: null` with one approval object for every value in `authority`, using the exact authority name and no duplicates;
5. put that authority's accountable person's name and role in each approval's `decider`;
6. record an ISO `decidedAt` date no earlier than the register update date for each approval;
7. link that authority's signed minute, approval record, contract, registrar record or policy in each approval's `evidence`, using an HTTPS URL or a committed path below `docs/governance/evidence/` rather than an unauditable label.

`pending` records must retain null decision fields. A resolved record passes only
when its approval authorities exactly match the controlled `authority` list;
one generic signatory cannot stand in for Legal, Privacy, Security, Product,
Engineering or Operations. `deferred` is a formal scope decision, not an
informal delay: its detail and per-authority evidence must state whether
affected work is removed from launch, moved post-launch or blocks release.
Changing a status in this repository without complete attributable evidence
does not resolve the blocker; `npm run check:decisions` rejects it.

## Workshop order

1. D11 with the Principal, Product and Engineering because every measured standard route currently misses the original 120 KiB initial-script ceiling. Choose whether the confirmed App Router baseline keeps that ceiling through a no-JavaScript delivery design, accepts a signed revised ceiling, or changes public rendering architecture. The measured 147.8-154.6 KiB representative baseline is evidence, not approval.
2. D01 domain, D07 Desk Officer, D08 counterparty stewardship and D09 honorarium policy because they gate launch-critical deployment and Protocol Desk operation.
3. S01-S06 provider and operational custody choices because they gate staging, external testing and production evidence.
4. D03 Doctrine/Positions, D02 Signal/Foresight, D06 Office Hours, D04 Selah and D10 archive use to bind launch versus post-launch scope.
5. D05 only with approved Legal wording or an explicit omission decision.
6. S07 video delivery after content rights and low-bandwidth behavior are confirmed.

After the signed evidence is attached, update the corresponding `AMANOR-*` rows in `agent_plan.md`; do not mark an implementation task done merely because its prerequisite was decided.
