import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [record, publication, launch, handover] = await Promise.all([
  readFile(
    "docs/content/templates/production-content-acceptance-record.md",
    "utf8",
  ),
  readFile("docs/content/publication-validation.md", "utf8"),
  readFile("docs/operations/templates/production-launch-record.md", "utf8"),
  readFile("docs/handover/README.md", "utf8"),
]);

const pendingSentinels = [
  "- Status: `Not started`",
  "- Release candidate, source revision and CMS export digest: `Not recorded`",
  "- Content freeze timestamp, owner and immutable evidence location: `Not scheduled`",
  "- Canonical legal/display/short/familiar names approved: `Not approved`",
  "- Current and long-form titles plus complete dated title history approved: `Not approved`",
  "- 40/120/300-word biographies and source references approved: `Not approved`",
  "- Pronunciation master, portraits, credits, licences and consent approved: `Not approved`",
  "- Verified profiles, affiliations, expertise and disambiguation approved: `Not approved`",
  "- P01-P13 English publication versions reviewed: `0 / 13`",
  "- P01-P13 French publication versions reviewed: `0 / 13`",
  "- Native French reviewer, translation method and parity evidence: `Not assigned`",
  "- Atlas launch nodes approved/reviewed: `0 / 0`",
  "- Speaking themes/platform history approved/reviewed: `0 / 0`",
  "- Signals, Archive/transcripts/corrections and Sources approved/reviewed: `0 / 0`",
  "- Scholars, Office Hours, Selah, riders and nine email templates approved: `Not approved`",
  "- Page FAQs, metadata, Open Graph and social assets approved: `Not approved`",
  "- Public canonical URLs, hreflang, sitemap, feeds, llms.txt and robots reviewed: `Not run`",
  "- Person/ProfilePage/Event/Article/VideoObject/FAQ/Organization schemas validated: `Not run`",
  "- Governed media inventory and Cloudinary reconciliation reference: `Not recorded`",
  "- No-sampling claim/source audit and rights/consent reference: `Not recorded`",
  "- Press Kit and three Living Dossier PDFs visually/print approved: `Not run`",
  "- The Record exact two-page print and Protocol Note one-page print approved: `Not run`",
  "- EN/FR email rendering and institutional delivery record reference: `Not recorded`",
  "- Accessibility, plain-language, public-office and procurement review: `Not run`",
  "- Broken links, stale translations, placeholder copy and unpublished references: `Not run`",
  "- Defects, owners, dates and corrected-version retest evidence: `None recorded`",
  "- Freeze exceptions with authority, reason and replacement digest: `None recorded`",
  "- Final CMS export digest equals approved frozen content: `Not recorded`",
  "- Principal approval/date: `Not approved`",
  "- Content Lead approval/date: `Not approved`",
  "- Native French reviewer approval/date: `Not approved`",
  "- Legal/rights approval/date: `Not approved`",
];

function validatePending(candidate) {
  for (const sentinel of pendingSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Production content record no longer proves pending state: ${sentinel}`,
    );
}

validatePending(record);
for (const sentinel of pendingSentinels)
  assert.throws(() =>
    validatePending(record.replace(sentinel, "[prematurely changed]")),
  );
const relativeLink = "templates/production-content-acceptance-record.md";
assert.ok(publication.includes(relativeLink));
assert.ok(launch.includes("production-content-acceptance-record.md"));
assert.ok(
  handover.includes(
    "../content/templates/production-content-acceptance-record.md",
  ),
);

process.stdout.write(
  `Production content acceptance is release-bound and ${pendingSentinels.length} pending-state mutations fail closed.\n`,
);
