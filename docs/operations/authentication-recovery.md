# Administrator authentication recovery

## Approved implementation boundary

The application supports only administrator self-recovery with a password and one previously issued single-use recovery code. There is no support-assisted bypass, plaintext code lookup or routine Principal break-glass path. Eight 80-bit codes are displayed once at enrollment or authenticated rotation; only purpose-separated HMAC hashes enter MongoDB.

Successful recovery is one MongoDB transaction: consume one matching hash, revoke every older session and enqueue an `account_recovered` notification. Code rotation atomically replaces the entire hash set and enqueues `recovery_codes_rotated`. A five-minute fresh-TOTP access token is required before rotation or any account-governance mutation; refresh removes elevation.

## Notification delivery

`AuthNotificationWorker` starts only when `RESEND_API_KEY` and `EMAIL_FROM` are configured. It claims at most ten due jobs per drain, reclaims locks older than one minute, uses the notification UUID as the provider idempotency key and retries with exponential backoff capped at one hour. The bilingual message contains only the event type, UTC time and escalation instruction. It never receives a password, TOTP value, recovery code/hash, access token or session secret.

After two failed attempts the worker emits a metadata-only alert marker. Operators must not copy the destination email or provider payload into an incident tool. Provider delivery evidence belongs in the controlled release record.

## Staging recovery drill

1. Use a non-production administrator and separately approved inbox. Record the starting session IDs without tokens or cookies.
2. Use one recovery code. Prove that it cannot be reused, every earlier session is revoked, the replacement session is marked `PWD + RECOVERY`, and one pending notification exists.
3. Simulate one provider failure. Prove the job remains durable with bounded backoff, then restore the provider and prove exactly one bilingual message is delivered using the same idempotency key.
4. Complete a fresh TOTP step-up, replace the code set, and prove every prior unused code is invalid while the new values are displayed only once.
5. Confirm authentication audit-chain integrity, notification indexes, redacted logs/metrics and absence of any secret or code in MongoDB outside the recovery hashes.
6. Security and the administrator sign the drill record. Delete the synthetic account and evidence containing its destination address according to the approved retention schedule.

Production remains blocked until Security approves the MFA/recovery policy and hardware-key scope, provider/DNS delivery is configured, and this drill passes in production-like staging.
