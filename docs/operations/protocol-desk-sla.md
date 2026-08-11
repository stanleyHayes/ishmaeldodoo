# Protocol Desk SLA and escalation

## Governed service level

The only presently approved request-level deadline is the brief-defined 48-hour status response. Submission creates a durable `status-update` correspondence job due exactly 48 hours later. A substantive lifecycle response cancels that scheduled message.

The API evaluates the queue every minute. An eligible status update that remains pending, processing, or failed after its deadline opens one deduplicated `initial_response_overdue` ticket. A correspondence job that reaches two failed attempts opens a `delivery_failure` page. Escalations contain only internal identifiers, reference, timestamps, type, severity, and attempt count; requester names, addresses, message content, and provider errors are excluded.

The protected Admin/CMS operational panel shows the current counts and redacted open escalations. Prometheus exposes bounded gauges by request state and escalation type plus the age of the oldest due correspondence. These metrics must never gain request, user, email, organisation, or free-text labels.

## Response

1. Open the protected Protocol Desk operational panel and identify the reference and escalation type.
2. For an overdue response, confirm whether a substantive lifecycle message is already due, then send or retry the correct governed correspondence. Do not send an improvised message outside the correspondence workflow.
3. For repeated delivery failure, check Resend status, configured sender, DNS authentication, and the institutional recipient route. Do not copy requester data into an incident tool.
4. Confirm the durable job becomes delivered or cancelled. The next evaluator pass resolves the escalation automatically.
5. Record notification, acknowledgement, action, delivery, resolution, and operator timestamps in the approved incident system.
6. Escalate to the Principal if the 48-hour deadline is missed or the requester cannot be reached through the approved route.

New decision and event-proximity SLAs must not be invented in code. Add them only after the Principal approves the target, calendar semantics, holiday/time-zone rules, severity, and owner.
