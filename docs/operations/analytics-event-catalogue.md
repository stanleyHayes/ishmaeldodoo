# Privacy-preserving analytics event catalogue

Analytics is optional and disabled until a visitor explicitly grants consent through the first-party `/api/analytics/consent` boundary. Refusal and absence are equivalent for collection: no event reaches the provider. Essential audience, locale, theme and Sahel preferences remain separate from analytics consent.

| Event                     | Purpose                                               | Permitted dimensions          |
| ------------------------- | ----------------------------------------------------- | ----------------------------- |
| `pageview`                | Aggregate route reach                                 | route, locale, mode           |
| `audience_selected`       | Understand voluntary dossier-door use                 | route, locale, audience       |
| `sahel_mode_enabled`      | Measure low-bandwidth mode adoption                   | route, locale, mode           |
| `atlas_filter_applied`    | Measure Atlas exploration without filter values       | route, locale, audience, mode |
| `atlas_record_opened`     | Measure aggregate Atlas detail use without record IDs | route, locale, audience, mode |
| `press_kit_requested`     | Measure Press Kit demand without requester identity   | route, locale, mode           |
| `protocol_desk_started`   | Aggregate funnel entry                                | route, locale, mode           |
| `protocol_desk_completed` | Aggregate successful funnel completion                | route, locale, mode           |

The contract rejects unknown fields and query strings. It never accepts names, email, telephone, free text, organisation, request/reference IDs, Atlas record IDs, IP address, user agent, referrer, JWT/session identifiers or raw content. The Next.js server constructs the provider payload, forwards no browser headers/cookies and suppresses provider failures so telemetry cannot block a user journey.

Before production, privacy/legal reviewers must approve the catalogue, consent wording, six-month choice lifetime, provider configuration, retention, data location and deletion/access process. Event QA must prove opt-out/no-choice silence, exact counts after opt-in, no sensitive provider payloads and dashboard aggregation thresholds.

Capture that provider-bound proof in the
[deployed analytics acceptance record](templates/deployed-analytics-acceptance-record.md).
