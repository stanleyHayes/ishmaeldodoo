# Protocol Desk calendar synchronization

- Scope: AMANOR-087
- Runtime owner: Protocol Desk Operations
- Status: provider-neutral implementation complete; provider selection and staging rehearsal outstanding

## Boundary

An accepted personal-capacity request creates one `calendar_sync_jobs` record in the same MongoDB transaction as the request transition, immutable event and acceptance correspondence. The queue contains only an opaque request ID. The API worker reads the authoritative request and sends a bounded event to the configured adapter; the browser and Admin application never receive the calendar credential.

Configure `CALENDAR_API_URL`, `CALENDAR_API_TOKEN` and `CALENDAR_ID` together. Production startup fails unless all three exist. The URL must be HTTPS and the token must contain at least 32 characters. The provider-facing adapter accepts:

```json
{
  "calendarId": "provider calendar identifier",
  "idempotencyKey": "protocol-desk:opaque-request-uuid",
  "externalReference": "PD-YYYY-NNNN",
  "summary": "approved event name",
  "startsAt": "ISO-8601 UTC instant",
  "endsAt": "ISO-8601 UTC instant",
  "location": "optional venue and city"
}
```

The adapter must upsert on `idempotencyKey` and return `{ "eventId": "bounded-provider-id" }`; HTTP 409 is treated as an idempotent success. Requester name, email, phone, notes, triage flags, theme, objectives, honorarium and correspondence never cross this boundary.

## Retry and reconciliation

The worker claims ten due jobs per drain, reclaims locks older than one minute and retries failures with exponential backoff capped at one hour. Success stores only completion time, a SHA-256 hash of the exact payload and the bounded provider event ID. Failure stores at most 200 characters of the adapter status/error and raises an application alert after the second attempt.

The protected Protocol Desk detail view exposes only this bounded status, attempt count, timestamps, provider reference, hash and safe error. A Principal or Desk Officer can reset a matching failed job through the typed retry operation; pending, processing and completed jobs cannot be reset. The action never accepts a provider payload or credential from the browser.

Before launch, Operations must select the adapter/provider, approve its data-processing terms and regional controls, provision a least-privilege calendar, configure secret custody and exercise:

1. Accept a synthetic request and confirm exactly one provider event.
2. Retry the identical request and prove no duplicate event.
3. Force a provider outage, observe a failed job and alert, restore service and prove automatic completion.
4. Compare event time, default two-hour end time, location and external reference with the authoritative request.
5. Rotate the adapter token without exposing it in logs, screenshots or evidence.
6. Record queue counts, provider event ID, payload hash, timestamps, owner and sign-off; do not record request content.
