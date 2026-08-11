# Publication validation matrix

This matrix is the implementation record for Project AMANOR brief Section 9.1. Validation is enforced by NestJS at the publication boundary; Admin guidance is not treated as a security control.

| Brief rule                                       | Enforced invariant                                                                                                                                                                            | Runtime evidence                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Atlas portfolio values require complete evidence | `portfolioValue` is rejected without `valueType`, ISO currency, value year or at least one `sourceRef`; orphaned value metadata is rejected                                                   | `atlasNodeSchema`, `validateForPublication` and workflow tests                    |
| Every biographical claim is sourced              | Each canonical `bio40`, `bio120` and `bio300` field has a corresponding non-empty source-reference list; every title-history item carries `sourceRef`                                         | Identity schema and schema tests; structured Admin identity editor                |
| Scholars require consent                         | Publication requires `consentStatus = granted`; granted consent also requires a timestamp and the governing consent-notice version                                                            | Scholar schema, publication validation and workflow tests                         |
| Policy-tagged Signals use two-person review      | Any tagged Signal is intrinsically policy-sensitive. The author cannot approve it, a submitted `false` flag cannot bypass it, and `approvedBy` is overwritten with the authenticated reviewer | Workflow, service and replica-set integration tests; Admin mandatory-review state |
| Non-watching Signals require review dates        | `expecting` and `callingIt` are rejected without `reviewDue`                                                                                                                                  | Signal schema and all-kind schema fixture tests                                   |
| Machine transcripts cannot enter Doctrine        | `transcriptStatus = machine` is incompatible with `approvedForDoctrine = true`                                                                                                                | Archive schema and publication tests                                              |
| Stale French is explicit                         | French payload projection preserves the source update date and renders the bilingual dated stale notice rather than silently presenting it as current                                         | Public projection/component/browser tests                                         |

## Collection-specific controls

- Atlas nodes require an ISO country, at least one theme and source, three-to-five bilingual outcomes, valid chronology, a region fallback when coordinates are unavailable, and complete metadata for every portfolio figure.
- Speaking themes use a 45-to-75-word validation band for the specified 60-word bilingual abstract, identify suited audiences, require at least two sourced past platforms, accept only the eight brief-defined formats and may link to governed Atlas and Archive/media evidence.
- Signals require 150-to-250 words in each populated locale, one-to-three tags and a publication timestamp. `Expecting` and `Calling it` require a review date; resolution, note and timestamp are atomic, cannot pre-date review, and cannot be attached to a `Watching` signal.
- Every Archive item carries a bilingual transcript and at least one source. Machine transcripts remain excluded from Doctrine; timestamp segments and chapters must be ordered, chapter anchors unique and corrections source-linked.
- Office Hours cycles persist their open, close, draw and answer dates; published weighting rules; bounded slot count; entry IDs; and the drawn subset. Validation rejects draws before closing, answers before the draw, excess selections, and selected IDs that are not entrants.
- Published Office Hours answers require the cycle/question IDs, entrant name and country, the bilingual question and answer, publication time and explicit entrant consent.
- Selah records are deliberately strict: only bilingual `body` and `publishedAt` are accepted. Tags, titles, images, related content and other metadata are rejected.
- Rider templates require every brief-defined operational section as bilingual structured lists. Generated Protocol Notes combine those governed defaults with bounded per-engagement overrides and suppress the honorarium section outside personal capacity.
- Email template keys are restricted to the nine deterministic Protocol Desk correspondence triggers. Named variables are allowlisted and remain escaped during rendering.
- Page `sections` are the implementation's ordered `blocks[]` representation; every section has a stable key and bilingual body, with optional heading and source references. Pages also carry bilingual metadata, an optional governed Open Graph asset ID and `noIndex`. Optional FAQs are bounded to 20 unique bilingual question/answer pairs and every answer requires one to ten Source Register references before publication; only the approved locale projection may produce visible FAQ content and `FAQPage` structured data.

## Source Register integrity

Source-reference strings are not accepted as evidence by themselves. Before publish or rollback, the API gathers references recursively and verifies that every reference resolves to a published Source Register entry in the target locale. A Source entry cannot be unpublished while a live published document depends on it. Dependency scans fail closed if their safety bound is exceeded.

## Bilingual publication

The same approved immutable version may be published independently to `en-GB` and `fr-FR`. Publishing a second locale is allowed after the first locale changes the version state to `published`; repeating the same version/locale publication is rejected. Every locale still runs its own translation and Source Register validation.

## Operational review

- Editors resolve every rejected field or missing source before resubmitting.
- Reviewers confirm that the named sources support the exact claim, not merely that the references exist.
- Source takedown requires dependent content to be replaced or unpublished first.
- French stale notices are temporary disclosure controls, not a substitute for translation parity work.
