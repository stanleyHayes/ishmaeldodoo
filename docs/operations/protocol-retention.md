# Protocol Desk retention operations

## Policy boundary

The build brief fixes Protocol Desk request and correspondence retention at 36 calendar months. The one-shot retention command pseudonymises expired request records instead of deleting lifecycle evidence. It removes requester and free-text operational data, deletes internal notes, cancels unsent correspondence, removes provider identifiers/errors and replaces every correspondence recipient. Immutable request events remain unchanged so state and decision history are not falsified.

This implementation is an engineering control, not Legal approval. A record with `retention.hold: true` fails safe and is excluded. Legal/Data Protection must approve who may place or release a hold, the reason categories, subject-rights handling and whether immutable operator identifiers require a separately governed pseudonymisation method.

## Separate job and database identity

Build the API artifact, then run the command as a daily managed cron job. The
same isolated command also enforces governed media disposal under the separate
[media retention runbook](media-retention.md):

```bash
MONGODB_RETENTION_URI='mongodb://retention-identity@database/project_amanor' \
CLOUDINARY_RETENTION_CLOUD_NAME='provider-account' \
CLOUDINARY_RETENTION_API_KEY='secret-manager-reference' \
CLOUDINARY_RETENTION_API_SECRET='secret-manager-reference' \
npm run retain --workspace @amanor/api
```

The job credentials exist only in the cron job. They must not be supplied to web, Admin or the migration job; the long-running API uses a separate Cloudinary credential. Grant the retention database identity only the reads and updates/deletes required on `protocol_requests`, `protocol_request_notes`, `correspondence` and the bounded media collections described in the media runbook; it does not update `protocol_request_events` or publications. A non-zero Protocol Desk or media failure count makes the command exit unsuccessfully for scheduler alerting.

## Evidence and recovery

The worker claims no more than 100 records per invocation, reclaims an abandoned processing lock after one hour and delays failed records for an hour before retry. Every completed request records the policy version, cutoff and pseudonymisation time. Re-running is idempotent.

After any point-in-time or logical restore:

1. Keep public and operator traffic disabled.
2. Apply forward migrations and verify `protocol_retention_scan` exists.
3. Run the retention command repeatedly until it reports zero pseudonymised and zero failed records.
4. Confirm held records remain readable, expired unheld records expose only retention placeholders, old notes are absent, unsent correspondence is cancelled and immutable lifecycle events are unchanged.
5. Record counts, timestamps, failures, reviewer and restored backup point in the controlled recovery evidence.
6. Re-enable traffic only after Privacy/Operations approval.

Provider mail already delivered cannot be recalled by this command. The approved processor agreement and provider-retention configuration must enforce the corresponding deletion schedule.
