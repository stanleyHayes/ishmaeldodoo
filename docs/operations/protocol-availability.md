# Protocol Desk availability

Published CMS `blackout` records and accepted, contracted, or delivered engagement requests are the governed availability sources. Only authenticated Principal and Desk Officer roles may query the combined view.

Checks use half-open overlap semantics: an interval conflicts when its start is before the requested end and its end is after the requested start. Engagements without an explicit end receive a two-hour operational duration. Query windows are limited to 31 days. Results expose a blackout document reference and reason or an engagement reference and event name; private blackout notes and requester data are never returned.

The Admin/CMS operational panel provides an interval check. Immediately before acceptance, NestJS repeats the check while excluding the request itself and rejects an unavailable interval. Triage remains advisory; a stale earlier score cannot bypass this final safety check.

## Remaining provider work

AMANOR-024 has not selected a calendar provider. After that written decision:

1. implement the provider adapter behind the NestJS boundary;
2. transactionally queue create/update/cancel operations with accepted lifecycle changes;
3. bind provider event IDs to request IDs without placing requester data in logs;
4. reclaim stale locks, retry with bounded backoff and reconcile ambiguous timeouts;
5. exercise provider outage, duplicate delivery, remote deletion and recovery in staging;
6. record notification and reconciliation evidence before AMANOR-087 moves to review.

Provider-specific fields, semantics, or credentials must not enter either Next.js application.
