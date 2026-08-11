# Protocol Desk correspondence

The Protocol Desk sends only published, locale-current CMS `emailTemplate` documents. It never falls back from French to English and it resolves the Principal's name and current title from the published canonical identity registry at delivery time.

## Required template keys

| CMS key               | Trigger                                    | Schedule                                         |
| --------------------- | ------------------------------------------ | ------------------------------------------------ |
| `acknowledgement`     | Public request committed                   | Immediate                                        |
| `status-update`       | Public request committed                   | 48 hours; cancelled after a substantive decision |
| `information-request` | State becomes `info_requested`             | Immediate                                        |
| `hold-placed`         | State becomes `held`                       | Immediate                                        |
| `acceptance`          | State becomes `accepted`                   | Immediate                                        |
| `decline-capacity`    | Decline category is diary/capacity         | Immediate                                        |
| `decline-fit`         | Decline category is fit                    | Immediate                                        |
| `decline-conflict`    | Decline category is public-office conflict | Immediate                                        |
| `follow-up`           | State becomes `delivered`                  | Three days later                                 |

Each document requires current `en-GB` and `fr-FR` values for `subject`, `bodyText`, and `bodyHtml`. The Principal must approve both rendered locales before publication.

## Variables

Templates may declare and use only these runtime values:

- `reference`
- `requesterName`
- `organisationName`
- `eventName`
- `eventDate`
- `principalName`
- `principalShortName`
- `principalTitle`
- `reason`
- `responseWindow`

Variables use `{{variableName}}`. HTML substitutions are escaped. An undeclared, missing, unresolved, stale, or unpublished value fails closed and requeues the message.

## Delivery behavior

- Request creation and state changes enqueue correspondence in the same MongoDB transaction as the immutable request event.
- Resend receives the correspondence UUID as its idempotency key.
- A worker reclaims stale locks and retries failures with bounded exponential backoff, capped at one hour.
- The worker emits an alert-level log after the second failure.
- Operators see status and delivery time in the protected request detail and may retry failed jobs. Recipient addresses and rendered bodies are not exposed in that history.
- Delivery is disabled unless both `RESEND_API_KEY` and `EMAIL_FROM` are configured.

## Principal decision delivery

- Saving the pre-decision Protocol Note configuration atomically replaces any pending decision delivery for that request and queues one durable delivery job.
- Exactly one active, invitation-accepted `principal` account must exist. Ambiguous or missing Principal custody fails closed and is retried without exposing recipient data in logs.
- One message contains the locale-matched Protocol Note PDF and every currently valid action. Each action URL carries its capability only in the fragment, so email scanners and HTTP access logs do not receive the token.
- Capability tokens are deterministically derived for safe retries, but MongoDB stores only their SHA-256 hashes. Resend receives the delivery UUID as its idempotency key, and the PDF timestamp is fixed to the delivery creation time so the retry payload is stable.
- Delivery is disabled unless `RESEND_API_KEY`, `EMAIL_FROM`, and the API-only `PROTOCOL_DECISION_DERIVATION_KEY` are configured. The derivation key must decode from base64 to exactly 32 bytes and must never be available to the web or Admin deployments.
- Do not rotate the derivation key while an issued 48-hour decision link may still be active. Stop new issuance, wait at least 48 hours after the last delivery (or revoke every active capability), rotate the secret, restart the API, then resume delivery. The current release deliberately does not implement a multi-key verification window.
- Provider responses, token values, message bodies, email addresses, and attachment contents must not be logged. Failed jobs retain only bounded operational error text and retry timing.

### Principal decision alert response

`AmanorPrincipalDecisionDeliveryFailure` pages only after the aggregate failed queue count remains above zero for two minutes. The metric and protected Admin health view expose counts only; neither contains request, recipient, token, content, or provider identifiers.

1. Confirm `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_WEB_ORIGIN`, and `PROTOCOL_DECISION_DERIVATION_KEY` are present in the API runtime without printing their values.
2. Confirm exactly one active, invitation-accepted Principal account exists. Resolve account ambiguity through the controlled identity process; never guess a recipient.
3. Check provider status and sending-domain health. Do not copy message payloads or recipient addresses into an incident ticket.
4. If the job remains failed after the dependency is healthy, use **Retry Principal delivery** on that request in the protected Protocol Desk. The API accepts only an exact request/delivery UUID pair whose current state is `failed`; pending, processing, delivered, cancelled, mismatched, and replayed retries fail closed. The delivery UUID remains the provider idempotency key and the message, PDF, and action capabilities remain stable.
5. Confirm the failed count returns to zero, capture aggregate metric/alert recovery evidence, and verify one delivery in the controlled test mailbox. Do not manually replay a delivered job.

## Launch evidence still required

1. Content and Principal send/read approval for all nine templates in both locales.
2. SPF, DKIM, and DMARC verification for the sending domain using the [email-domain authentication gate](email-domain-authentication.md).
3. Successful delivery to `.gov.gh`, `.un.org`, and EU institutional test mailboxes.
4. A staging provider-outage drill proving retry, alerting, recovery, and no duplicate delivery.
5. A Principal-controlled mailbox and real-phone exercise proving the four fragment links, explicit confirmation, one-time consumption, and sibling revocation.
