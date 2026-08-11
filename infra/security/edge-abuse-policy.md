# Edge WAF and bot-management policy

This policy is the deployment contract for the independently hosted public web, Admin/CMS and NestJS API. It does not claim that an edge provider is provisioned. Apply and rehearse it after D01 confirms the three real domains and the Cloudflare account.

## Required controls

- Permit only HTTPS; redirect HTTP at the edge and retain the application HSTS policy.
- Put Admin/CMS behind identity-aware access in preview and staging. Production login remains reachable only at the approved Admin hostname.
- Challenge known automated and verified-bad bot traffic on public HTML routes. Never challenge accessibility tools solely because JavaScript, cookies or high bandwidth are unavailable.
- Block non-browser traffic to Admin/CMS except approved uptime probes.
- Enforce request-body limits before origin: 2 KiB analytics, 64 KiB authentication, 256 KiB public forms and 1 MiB CMS JSON. Cloudinary binary upload bypasses the application origin and uses short-lived API-signed parameters.
- Rate-limit by edge-generated client identity: authentication 10/minute/IP, public submissions 12/hour/IP, analytics 120/minute/IP, public reads 600/minute/IP. Application Mongo limits remain authoritative for sensitive writes.
- Block requests with malformed methods, conflicting content lengths, invalid transfer encoding, encoded path traversal or a body on methods that do not accept one.
- Exempt signed API-to-web revalidation only after signature validation at origin; an IP allowlist alone is insufficient.
- Preserve `X-Request-ID` and W3C `traceparent`; do not forward edge cookies, IPs or bot scores into analytics.

## Required evidence before launch

Export the active ruleset, redact account identifiers, and attach it to the launch record. From staging, prove one allowed request and one blocked/challenged request for each rule class; prove `429` does not cache; inspect origin logs for request/trace correlation; test rollback to the previous ruleset; record operator, timestamps and notification results. Security approval and a provider-side bot false-positive review are mandatory before AMANOR-034 can move to `DONE`.
