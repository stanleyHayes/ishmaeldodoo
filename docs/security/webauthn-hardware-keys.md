# WebAuthn hardware-key operations

- Status: Implemented behind `WEBAUTHN_ENABLED=false`; production enablement requires Security approval.
- Scope: AMANOR-050, AMANOR-093 and AMANOR-116.
- Consumer: Admin browser and the independently deployed NestJS API only.

## Fail-closed configuration

The API registers the endpoints in every build but returns an indistinguishable not-found response while WebAuthn is disabled. Enabling requires all four values:

- `WEBAUTHN_ENABLED=true`
- `WEBAUTHN_RP_ID`: the approved Admin registrable domain or exact host;
- `WEBAUTHN_RP_NAME`: the human-readable Project AMANOR Admin name;
- `WEBAUTHN_ORIGIN`: the exact `ADMIN_ORIGIN`, including scheme and port.

Production requires HTTPS. The Admin hostname must equal or be a subdomain of the RP ID. Preview, staging and production use separate RP configuration and credentials; credentials cannot be copied between environments.

## Enrollment and use

1. Sign in with password and TOTP.
2. Complete a fresh TOTP step-up. Enrollment and revocation are refused without `totp`, `step_up` and a step-up timestamp no older than five minutes.
3. Give the physical key a non-sensitive operator label and complete its browser prompt with user verification. The server accepts only ES256 or RS256 credentials and requests a cross-platform security key.
4. To enter the Room, select **Verify hardware key** and complete user verification. A successful assertion updates the authenticator counter atomically and replaces the in-memory access token with a five-minute token containing exact `hwk` and `step_up` methods.

The database stores the public key, credential ID, signature counter, transports, AAGUID, device/back-up classification and operator label. It never receives a private key, biometric, PIN or raw ceremony challenge. Ceremony challenges are SHA-256 hashed, user/session/purpose bound, single-use and expire after five minutes.

## Production approval gates

Keep WebAuthn and the Room disabled until Security records:

1. approved RP ID/origin for each environment;
2. approved authenticator models, attestation policy and whether multi-device/backed-up credentials are allowed;
3. two-person issuance, spare-key custody, revocation and lost-key recovery ownership;
4. a real-key enrollment, assertion, replay, counter-conflict, revocation and recovery drill;
5. an independent WebAuthn and Room authorization review.

Loss or suspected compromise requires revoking the credential after fresh TOTP verification, reviewing the chained `hardware_key_*` security events and following the supervised recovery procedure. Do not weaken the Room's `ROOM_REQUIRED_AMR=hwk` default to recover access.
