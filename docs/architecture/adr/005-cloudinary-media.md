# ADR-005: Cloudinary media

- Status: Accepted technical baseline; account policy pending
- Date: 9 August 2026

## Decision

Use Cloudinary for image, audio and approved short-form media management. Browser uploads use short-lived signed parameters issued to authorised CMS users; API secrets never reach the browser. Upload presets are locked down by environment, type, size and format. Public IDs follow environment/module/content identifiers rather than personal filenames.

Editors always begin with a local file selected through the governed Media workspace. Every image-bearing content record—including canonical portraits, Atlas nodes, Scholar profiles, Speaking media, page social images, Record field images and marginalia—stores only registry UUIDs selected from the uploaded library. Editors cannot accept, paste or persist an image URL or raw asset ID. Cloudinary's verified delivery URL belongs only to the server-owned media registry/public projection and cannot be authored as CMS content.

The CMS persists asset metadata and rights independently of Cloudinary. Delivery uses named responsive transformations, modern formats, width caps and quality policy. Original downloads require an explicit approved use case. Private/unreleased assets are authenticated and cannot be inferred from public URLs.

Deletion is two-stage: mark unavailable in the CMS, confirm no published references and retention hold, then destroy the provider asset and record the result. Publication, rollback, manual deletion and scheduled retention contend on the same per-asset `media_reference_locks` document inside MongoDB transactions. Publication validates the active registry record after acquiring that lock; retirement acquires it before checking publications and quarantining the asset. Consequently, either publication commits while retirement defers, or retirement commits while publication fails closed—neither ordering can create a newly broken public reference.

Cloudinary deletion remains outside the database transaction. A manual provider failure restores the quarantined registry asset; once the provider deletion succeeds, a registry-completion failure leaves the asset quarantined and raises a reconciliation error rather than falsely making it active. Scheduled retention likewise keeps failed deletions quarantined for a bounded retry. Cloudinary is delivery infrastructure, not the sole rights/source-of-truth database; masters and critical metadata need a backup/export policy. Lock documents contain asset identifiers and coordination timestamps only and are bounded to one record per governed asset.

## Verification

Test forged/expired upload signatures, type/size restrictions, cross-environment access, local-file selection, rejection of authored image URLs, governed-library selection across every image-bearing CMS field, transformations, asset weight, alt/rights validation, draft privacy, reference-safe deletion, concurrent publication-versus-retirement ordering and provider-failure compensation/reconciliation.
