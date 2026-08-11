# ADR-004: First-party custom CMS

- Status: Accepted technical baseline; editorial roles pending
- Date: 9 August 2026

## Decision

Build the CMS UI as the independent protected `apps/admin` Next.js application. NestJS owns the CMS domain, validation, authorisation, workflow, audit and MongoDB collections. A content document owns stable identity and type; each save through the API appends an immutable version. A publication record points each locale to the approved version. Public API projections never query mutable drafts.

Every localisable field stores English and French values plus `current`, `stale` or `missing` translation state. Editing an approved English source marks its French counterpart stale when the field is translation-coupled. The French public surface displays the brief's dated stale notice rather than silently presenting outdated copy.

Workflow: draft -> in review -> approved -> scheduled/published -> superseded. Authors cannot approve their own policy-sensitive signals. Permission checks and state transition guards run in NestJS. Publishing appends an audit event and outbox job transactionally; a signed webhook to `apps/web` makes revalidation retryable. Rollback moves the publication pointer to an earlier immutable version and creates a new audit event.

Cloudinary references store public ID, version, resource type, dimensions, transformation policy, alt text, focal point, rights, consent and retention metadata. Deletes are staged until reference and retention checks pass.

## Schema invariants

The custom schemas preserve every minimum document type and validation rule in Section 9 of the founding brief. Schema changes require forward-only migrations and content sign-off before removing a field.

## Verification

Test concurrent editing, locale staleness, approval separation, scheduled publishing, failed revalidation, audit immutability, rollback, source/consent enforcement, role boundaries and draft leakage.
