# Email domain authentication

## Launch policy

Project AMANOR sends transactional mail only from the dedicated domain selected with the email provider. `EMAIL_FROM` may be a bare mailbox or the standard bounded form `Project AMANOR <desk@example.org>`; control characters, malformed display names and invalid addresses fail API startup. Its address must use the exact authenticated domain. Production approval requires one SPF policy ending in `-all`, a resolvable DKIM public key, and a DMARC policy applied to 100 percent of mail with strict SPF and DKIM alignment and `p=quarantine` or `p=reject`.

The DKIM selector and all DNS records are public configuration, not credentials. Never place the provider API key, message bodies, recipient addresses, or delivery-event payloads in DNS evidence.

## Live verification

After the provider and sending domain are approved and DNS has propagated, run:

```sh
npm run verify:email-domain -- \
  --from desk@mail.example.org \
  --domain mail.example.org \
  --selector provider-selector
```

The command resolves DNS directly, follows a single DKIM CNAME delegation when present, and prints only the checked names and pass state. Save that output with the release-candidate evidence, together with the UTC check time, DNS change ticket, provider verification screenshot, and named reviewer. Do not copy raw API credentials or delivery payloads.

## Required independent evidence

1. Platform verifies the live production-intended domain from two independent public resolvers after propagation.
2. Security confirms that SPF authorizes only the selected sender, DKIM signing is enabled, and DMARC reports route to an approved controlled mailbox.
3. Operations sends the approved bilingual templates to controlled `.gov.gh`, `.un.org`, and EU institutional test mailboxes and records delivery/read results without retaining message content in tickets.
4. Any failed alignment, unexpected extra SPF record, downgraded DMARC policy, or provider re-verification blocks release.

The root gate runs six adversarial offline fixtures. That proves policy enforcement in code; it does not prove that a real domain is configured.
