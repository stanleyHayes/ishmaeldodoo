import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [record, contentRecord, launchRecord, handover] = await Promise.all([
  readFile(
    "docs/operations/templates/production-discoverability-record.md",
    "utf8",
  ),
  readFile(
    "docs/content/templates/production-content-acceptance-record.md",
    "utf8",
  ),
  readFile("docs/operations/templates/production-launch-record.md", "utf8"),
  readFile("docs/handover/README.md", "utf8"),
]);

const pendingSentinels = [
  "- Status: `Not run`",
  "- Production release, content-freeze digest and validation window: `Not recorded`",
  "- Canonical public origin, DNS/TLS and ownership evidence: `Not recorded`",
  "- Search Console property owner and verification method: `Not configured`",
  "- English/French sitemap submission and accepted status: `Not run`",
  "- Crawl/index coverage baseline and excluded-reason review: `Not run`",
  "- P01-P13 EN/FR canonical and reciprocal hreflang validation: `Not run`",
  "- x-default, duplicate Atlas table and special-route canonical review: `Not run`",
  "- Production robots.txt permits intended crawl scope: `Not run`",
  "- Preview/Admin/private/sensitive surfaces remain noindex or inaccessible: `Not run`",
  "- English/French Archive Atom feeds validate and are discoverable: `Not run`",
  "- llms.txt identity, title and authoritative-link review: `Not run`",
  "- Person/ProfilePage and Organization external schema validation: `Not run`",
  "- Event external schema validation: `Not run`",
  "- Article and VideoObject external schema validation: `Not run`",
  "- FAQPage external schema validation and visible-content parity: `Not run`",
  "- Open Graph 1200x630 and Twitter/social preview validation: `Not run`",
  "- Approved governed social assets, titles and descriptions reviewed: `Not run`",
  "- Representative Google/Bing URL inspection and rendered crawl: `Not run`",
  "- Redirects, 404/unpublished, locale, query and trailing-path behavior: `Not run`",
  "- CDN/cache headers and post-publish/takedown convergence: `Not run`",
  "- Broken links, mixed content, blocked resources and crawl errors: `Not run`",
  "- Analytics consent and crawler/bot traffic interpretation reviewed: `Not run`",
  "- Defects, owners, target dates and post-fix revalidation evidence: `None recorded`",
  "- Final zero-blocking-crawl/schema/social result: `Not recorded`",
  "- Search/Discoverability owner approval/date: `Not approved`",
  "- Content approval/date: `Not approved`",
  "- Product approval/date: `Not approved`",
  "- Security/Privacy approval/date: `Not approved`",
];

function validatePending(candidate) {
  for (const sentinel of pendingSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Discoverability record no longer proves pending state: ${sentinel}`,
    );
}

validatePending(record);
for (const sentinel of pendingSentinels)
  assert.throws(() =>
    validatePending(record.replace(sentinel, "[prematurely changed]")),
  );
const relativeLink = "production-discoverability-record.md";
assert.ok(contentRecord.includes(relativeLink));
assert.ok(launchRecord.includes(relativeLink));
assert.ok(
  handover.includes(
    "../operations/templates/production-discoverability-record.md",
  ),
);

process.stdout.write(
  `Production discoverability evidence is release-bound and ${pendingSentinels.length} pending-state mutations fail closed.\n`,
);
