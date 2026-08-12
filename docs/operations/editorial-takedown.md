# Editorial takedown and recovery

## Purpose and target

This runbook removes an unsafe or incorrect locale publication without deleting its immutable version or editorial evidence. The operational target is for the affected public content to be unreachable within 15 minutes of an authorised takedown decision.

Only a Principal or Reviewer may execute the CMS takedown. A policy, finance, Authority, impersonation, defacement, or public-safety concern is treated as a high-severity content incident and must also follow the incident-response and communications process selected by the organisation.

## Takedown procedure

1. Record the decision time, incident reference, affected content type, document ID, locale, and approving Principal or Reviewer in the incident record. Never paste credentials, unpublished content, requester data, or Room material into alerts or chat.
2. Sign in to the separately deployed Admin/CMS using MFA. Open **Content**, select the exact content type and document ID, and open the currently published immutable version.
3. Confirm the affected locale under **Takedown locale**. Select **Prepare unpublish**, re-check the locale and document address, then select **Confirm … takedown**.
4. Treat the operation as successful only when the console reports that the locale publication was removed, revalidation was queued, and the takedown was audited. The API transaction removes the publication pointer, appends the `unpublished` event and queues cache-tag revalidation atomically.
5. Open **Audit trail** and require a `valid` chain status containing the new `unpublished` event, actor, UTC timestamp, locale and diff. Export the v2 audit JSON into the restricted incident evidence store.
6. Verify the public locale URL and any discoverability surface that linked it. The affected content must return the configured unpublished/not-found state and must not appear in sitemap, feed, `llms.txt`, structured data or public API projections. Verify both origin and CDN/edge behavior.
7. If revalidation is delayed, inspect the durable `outbox_jobs` state and the revalidation alert. Do not recreate or delete the job manually. The worker reclaims abandoned locks and retries with bounded backoff. Purge only the narrowly affected cache tags through the approved provider console if the 15-minute target is at risk, and record that exceptional action.
8. Record public-verification time, elapsed minutes, operator, reviewer, cache state, screenshots or HTTP evidence, and follow-up owner. Escalate immediately if content remains reachable at 10 minutes.

## Recovery and mistaken takedown

Use **Restore this version** only after a Principal or Reviewer authorises recovery and confirms the correct locale. Restoration creates a new publication pointer, queues revalidation and appends a `rolled_back` event; it never edits the historical version or removes the takedown event. Repeat the public, cache and audit checks above.

## Evidence and retention

Retain the incident decision, timestamps, public checks and exported audit envelope under the approved security and legal schedule. Editorial audit collections have no application deletion path. A production retention or archival duration must not be introduced until AMANOR-113 receives Legal approval; any eventual subject-erasure procedure must pseudonymise personal fields without breaking the state history or chain.

## Rehearsal gate

Before launch, rehearse one bad-content takedown and one mistaken-takedown recovery in staging. Evidence must show separate Admin, API and public-web deployments; MFA and role checks; Mongo transaction results; outbox delivery; origin and edge invalidation; a valid exported chain; and elapsed time below 15 minutes. AMANOR-145 remains open until that signed rehearsal exists.

Record both independently timed scenarios in the controlled
[`editorial-takedown-rehearsal-record.md`](templates/editorial-takedown-rehearsal-record.md).
The release-candidate record continues to hold Web/Admin/API code rollback
evidence; neither record substitutes for the other.
