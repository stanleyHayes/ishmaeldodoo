# Source Register and claim audit

Authorised Principal, Editor and Reviewer roles can download the complete protected report from Admin **Content** or `GET /v1/cms/content/source-audit/report`.

NestJS joins every publication pointer to its exact published version, capped at 10,000 rows. It extracts all structured `sourceRef`, `sourceRefs` and `*SourceRefs` values, checks that each reference has a published Source Register entry in the same locale, identifies duplicate references used by multiple source documents, and reports unused sources. The export contains document IDs, versions, locales and references only; it does not include payload bodies or confidential source notes.

This automation proves completeness of the structured graph, not source quality. Content/Legal must inspect every report row with no sampling, open each underlying source, verify the claim is accurately supported, confirm publication rights/consent and locale suitability, resolve duplicates/missing references, and sign the dated report. Zero machine-detected gaps is necessary but not sufficient for AMANOR-110 completion.
