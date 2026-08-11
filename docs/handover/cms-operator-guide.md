# CMS and operations guide

## Access and session safety

Use only the separately deployed Admin/CMS origin. Sign in with the assigned account, password and MFA; never share accounts. The sidebar reflects assigned roles but the API remains authoritative. Sign out on shared devices and use Security to revoke an unfamiliar session. Report unexpected access or role changes immediately.

## Content lifecycle

1. Open **Content**, choose the exact document type and record, then inspect existing versions.
2. Create or edit a draft. Public identity, claims and source references must come from governed records rather than hard-coded copy.
3. Complete both `en-GB` and `fr-FR`. Treat `missing` and `stale` as release blockers, not translation hints to ignore.
4. Submit the version for review. Policy-sensitive material requires an approver different from its author.
5. The reviewer checks content, locale parity, evidence, consent/rights and preview before approval.
6. Publish each approved locale deliberately. Verify the public URL, canonical/hreflang pair and source links.
7. Use the Audit trail to inspect actor, time and diff. Verify integrity if tampering is suspected.

Never edit production data directly in MongoDB. Never work around a validation failure by weakening source, consent, translation or two-person controls.

## Rollback and emergency takedown

For an ordinary correction, create and approve a new version. For urgent risk, follow the editorial takedown runbook: identify the affected locale, prepare unpublish, confirm the exact locale, verify it is unreachable, preserve the audit trail and notify the incident owner. Do not delete the underlying version or audit evidence.

## Governed media

1. Open **Media** only with an authorised Principal, Editor, Press Officer or applicable Trust role.
2. Upload through the signed Cloudinary flow; the API independently verifies provider identity, type and size.
3. Record bilingual alt text, credit, source, consent/licence, transformation policy, focal point and retention state.
4. Preview focal-point behavior on intended public surfaces.
5. Retirement is two-step and fails closed for legal holds, unelapsed retention or published references. Resolve the reference or authority first; never delete directly in Cloudinary.

## Protocol Desk

Desk Officers use the queue to search, filter, assign, add bounded notes, clear flags with reasons, send correspondence, inspect availability and save the Protocol Note configuration. They cannot make final accept/decline decisions. The Principal performs the final transition; acceptance fails if configuration or current availability is invalid.

The operational panel shows pending delivery and redacted SLA escalations. Follow the linked runbooks for correspondence retries and SLA response. Do not paste requester content into tickets, alerts or general CMS records.

## Security administration

Security Administrators may invite users, change roles, disable accounts, review redacted authentication events and validate the audit chain. Assign the smallest role set. Role/disable changes revoke active sessions. Invitation links are single-use and expire; do not transmit them through an unapproved channel.

Security-key enrollment is available only when the API's approved WebAuthn relying party is enabled. Complete a fresh TOTP step-up, enter a non-sensitive label that identifies the issued physical key, then select **Enrol local security key** and follow the browser prompt. The private key, PIN and biometric remain inside the authenticator. Never photograph, export, share or enter those values into the CMS.

Use **Verify hardware key** for a five-minute `hwk` elevation. Refreshing or signing out removes elevation. Revocation also requires fresh TOTP: revoke a lost, reassigned or suspect key immediately, preserve the chained hardware-key event and follow the incident runbook. Do not weaken `ROOM_REQUIRED_AMR`, share a spare key or use another person's authenticator as a recovery shortcut. The approved issuance inventory and custody procedure remain outside the application.

High-risk account changes require the **Confirm high-risk changes** TOTP step-up and expire after five minutes. Store enrollment recovery codes offline; replacing them invalidates the prior set and displays the new values once. Recovery use revokes older sessions and is audited. The production recovery procedure, provider notification and hardware-key policy are not approved yet: do not invent a manual/support bypass, and escalate to the security owner and incident runbook.

Recovery and code rotation also enqueue a content-free bilingual notice to the account address. Follow the [authentication recovery runbook](../operations/authentication-recovery.md) for durable delivery, outage handling and the required staging drill; never paste the message destination or any authentication value into general support tooling.

## End-of-task verification

- Confirm the intended locale/state and public result.
- Confirm no private note, requester data, token or draft appears publicly.
- Record the governed reference, not screenshots containing personal data.
- Escalate validation, provider or integrity failures rather than retrying destructive actions blindly.
