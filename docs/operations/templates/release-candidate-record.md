# Project AMANOR release-candidate record

- Candidate ID: `Not assigned`
- Environment: `Not deployed`
- Source revision: `Not recorded`
- Pipeline/review evidence: `Not run`
- Prepared/approved: `Not assigned` / `Not approved`

## Immutable releases

| Deployable    | Release/image digest | Configuration revision | Origin          | Prior rollback target | Status       |
| ------------- | -------------------- | ---------------------- | --------------- | --------------------- | ------------ |
| Web release   | Not recorded         | Not recorded           | Not provisioned | Not recorded          | Not deployed |
| Admin release | Not recorded         | Not recorded           | Not provisioned | Not recorded          | Not deployed |
| API release   | Not recorded         | Not recorded           | Not provisioned | Not recorded          | Not deployed |

## Migration

- Migration IDs/checksums: `Not run`
- Separate job identity and least-privilege evidence: `Not run`
- Start/end and idempotent re-run: `Not run`
- Backup/recovery point: `Not run`

## Smoke evidence

- Remote smoke JSON: `Not run`
- Timed rollback rehearsal JSON: `Not run`
- Editorial takedown/recovery rehearsal record: `Not run`
- API dependent jobs paused/resumed: `Not run`
- Provider state matched all three declared rollback targets: `Not run`
- Preview/staging unauthorised access denied: `Not run`
- Browser, accessibility and performance evidence: `Not run`
- Security/load/failure-mode evidence: `Not run`
- 100x load result/provider graphs: `Not run`
- Protocol Desk under-load result and synthetic cleanup: `Not run`
- Content/French/Principal/UAT approvals: `Not approved`

## Rollback

| Path                    | Start/end | Result  | Independent services unchanged | Evidence     |
| ----------------------- | --------- | ------- | ------------------------------ | ------------ |
| Public content          | Not run   | Not run | Not verified                   | Not recorded |
| Web code                | Not run   | Not run | Not verified                   | Not recorded |
| Admin code              | Not run   | Not run | Not verified                   | Not recorded |
| API code/forward repair | Not run   | Not run | Not verified                   | Not recorded |

## Decision

- QA recommendation: `Not approved`
- Product: `Not approved`
- Engineering: `Not approved`
- Security/Privacy/Content as applicable: `Not approved`
- Principal acceptance gates: `Not approved`
- Promotion or rejection reason: `Not recorded`
- Known limitations with owner/date: `None recorded`
