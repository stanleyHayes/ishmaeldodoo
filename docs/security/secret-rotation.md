# Secret rotation

## JWT access-token signing keys

The API signs ES256 access tokens with exactly one active private key. It may verify the active public key and no more than two retiring public keys through `JWT_VERIFICATION_KEYS`. Retiring private keys must never remain in the deployment after the active key changes. Access tokens expire after five minutes, so a normal rotation needs only one retiring public key for five minutes plus the configured five-second clock tolerance.

Use unique, non-secret key IDs that include the rotation period. Store all private material in the deployment provider's secret manager; never place it in source, build arguments, frontend environments, logs or tickets.

### Rotation procedure

1. Generate a new P-256 key pair in the approved key-management boundary. Record its custodian and rotation ticket without copying private material into the record.
2. Add the new public key to `JWT_VERIFICATION_KEYS` while the existing key remains active. Deploy the API and verify readiness, login and an existing authenticated session.
3. Set `JWT_KEY_ID`, `JWT_PRIVATE_KEY_PEM` and `JWT_PUBLIC_KEY_PEM` to the new pair. Keep the previous public key in `JWT_VERIFICATION_KEYS`; remove the previous private key from the deployment secret version. Deploy and verify that a new token carries the new `kid`, while a token issued immediately before the change still succeeds.
4. Wait at least five minutes and five seconds after the last instance using the old signing key has stopped. Remove the retiring public key and deploy again.
5. Verify login, refresh, authenticated API access, logout and the authentication audit trail. Record timestamps, deployment IDs, key IDs and results; never record token or key values.
6. Revoke the superseded provider secret version. If any step fails, restore the previous active version, revoke sessions issued during the uncertain window and open a security incident.

Do not rotate by replacing the active key and its only verification key in one deployment: that unnecessarily invalidates still-live access tokens. Do not retain a retiring public key beyond the bounded overlap unless Security records an incident exception.

## Session pepper

`SESSION_PEPPER` hashes refresh-token secrets and administrator invitation tokens. `SESSION_RETIRING_PEPPERS` accepts no more than two unique prior values during a bounded transition. Never expose either value or persist a pepper identifier beside a token hash.

1. Add the future pepper to the secret manager without changing the deployment. Keep the current value available for rollback.
2. Deploy the future value as `SESSION_PEPPER` and place the previous value in `SESSION_RETIRING_PEPPERS` in one coordinated rollout. New logins and invitations immediately use the active value. A valid refresh created with the retiring value is atomically re-hashed with the active value at its next rotation; replay detection checks every trusted pepper and still revokes the token family.
3. Verify a new login/refresh, a refresh token issued immediately before deployment, a pending invitation created before deployment, logout and replay-family revocation.
4. Keep the retiring value for the approved drain period. Refresh sessions can live for 30 days and invitations for 24 hours, so removal before the relevant records expire intentionally signs users out or invalidates invitations and requires Product/Security approval plus user communication.
5. Remove and revoke the retiring value after the approved cutoff. Record counts of forced session revocations or reissued invitations without recording their tokens.

## MFA encryption key

`MFA_ENCRYPTION_KEY` is the active 32-byte AES-256-GCM key. `MFA_RETIRING_ENCRYPTION_KEYS` accepts no more than two unique prior keys during migration. GCM authentication identifies the matching trusted key without accepting unauthenticated plaintext.

1. Generate a new 32-byte key in the approved secret boundary. Deploy it as active while placing the previous key in the retiring array.
2. After a user proves their password and TOTP, or proves a valid pending invitation token, the API compare-and-swaps that exact prior ciphertext to a fresh IV/ciphertext/tag under the active key. Wrong TOTP attempts do not migrate ciphertext.
3. Exercise successful and failed login, TOTP replay rejection, invitation setup/acceptance and concurrent migration conflict. Monitor migration conflicts without logging user secrets or ciphertext.
4. Keep the retiring key until every enrolled administrator has migrated or Security executes an approved forced re-enrollment plan for dormant accounts. A Security Administrator may read `GET /v1/auth/mfa/encryption-status`; it checks at most 1,000 enrolled records and returns only active, retiring and unreadable counts. Key removal is fail-closed unless `safeToRetire` is true. A truncated or unreadable report is never approval to retire a key. Never export ciphertext into the handover package.
5. Remove and revoke the retiring key, verify every privileged account, and retain the signed rehearsal record. Loss of all keys capable of decrypting an enrolled factor requires secure MFA re-enrollment; there is no plaintext recovery fallback.

## Other secret classes

Service HMAC key rings (`PUBLIC_WEB_SERVICE_KEYS` and `REVALIDATION_WEBHOOK_KEYS`) use active/retiring key IDs and should follow the same add, switch, drain and remove pattern. Database, Cloudinary, email and monitoring credentials require provider-side dual credentials, least-privilege validation, consumer rollout, old-credential revocation and a recorded rollback test.

Production custody, named approvers, emergency access, provider audit evidence, an aggregate MFA-migration completion report and an observed rotation rehearsal remain deployment acceptance gates.
