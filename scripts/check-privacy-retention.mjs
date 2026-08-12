import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  schedule,
  contracts,
  enquiryService,
  repository,
  retentionService,
  mediaRetentionService,
  mediaRepository,
  retentionCommand,
  mediaRunbook,
  ttlRunbook,
  handover,
  rehearsal,
] = await Promise.all([
  readFile("docs/privacy/data-inventory-retention.md", "utf8"),
  readFile("packages/contracts/src/room.ts", "utf8"),
  readFile(
    "apps/api/src/modules/room/application/room-enquiry.service.ts",
    "utf8",
  ),
  readFile(
    "apps/api/src/modules/room/persistence/room-enquiry.repository.ts",
    "utf8",
  ),
  readFile(
    "apps/api/src/modules/room/application/room-retention.service.ts",
    "utf8",
  ),
  readFile(
    "apps/api/src/modules/media/application/media-retention.service.ts",
    "utf8",
  ),
  readFile(
    "apps/api/src/modules/media/persistence/media.repository.ts",
    "utf8",
  ),
  readFile("apps/api/src/retention.ts", "utf8"),
  readFile("docs/operations/media-retention.md", "utf8"),
  readFile("docs/operations/ttl-retention-monitoring.md", "utf8"),
  readFile("docs/handover/README.md", "utf8"),
  readFile(
    "docs/operations/templates/retention-deletion-rehearsal-record.md",
    "utf8",
  ),
]);

function roomScheduleRow(markdown) {
  const rows = markdown
    .split("\n")
    .filter(
      (line) =>
        /^\| The Room\s+\|/u.test(line) && line.includes("Ciphertext received"),
    );
  const [row] = rows;
  assert.ok(row, "The privacy schedule must contain exactly one Room row");
  assert.equal(
    rows.length,
    1,
    "The privacy schedule contains duplicate Room rows",
  );
  return row;
}

function validateRoomRetentionDocumentation(markdown) {
  const row = roomScheduleRow(markdown);
  assert.match(row, /180 days \(`Brief`\)/u);
  assert.match(row, /Implemented for the current inline encrypted envelope/u);
  assert.match(row, /content-free tombstone/u);
  assert.match(row, /failures for retry/u);
  assert.match(row, /Legal approval/u);
  assert.doesNotMatch(row, /Not implemented/u);
}

validateRoomRetentionDocumentation(schedule);

assert.match(
  contracts,
  /export const ROOM_RETENTION_DAYS = 180;/u,
  "The Room contract must retain the brief's 180-day default",
);
assert.match(
  contracts,
  /export const ROOM_EXTENSION_MAX_COUNT = 2;/u,
  "Room retention extensions must remain count-bounded",
);
assert.match(
  enquiryService,
  /deleteAfter: deletionDeadline\(now, ROOM_RETENTION_DAYS\)/u,
  "Room receipt persistence must set the controlled deletion deadline",
);
for (const field of [
  "envelope",
  "ciphertextDigest",
  "ciphertextBytes",
  "locale",
  "recipientKeyId",
  "keyEpoch",
  "envelopeId",
]) {
  assert.match(
    repository,
    new RegExp(`${field}: ["']{2}`, "u"),
    `Room deletion must remove ${field}`,
  );
}
assert.match(
  repository,
  /deletion: \{ status: "done", attempts: 0, deletedAt \}/u,
);
assert.match(retentionService, /action: "room_enquiry_deleted"/u);
assert.match(retentionService, /recordDeletionFailure\(record\.reference\)/u);

for (const required of [
  /claimRetentionIfUnreferenced/u,
  /cloudinary\.destroy/u,
  /completeRetention/u,
  /failRetention/u,
])
  assert.match(mediaRetentionService, required);
assert.match(
  mediaRepository,
  /status: "quarantined"/u,
  "Expired media must leave public active state before provider deletion",
);
assert.match(
  mediaRepository,
  /secureUrl: ""/u,
  "Deleted media tombstones must not retain a delivery URL",
);
assert.match(retentionCommand, /CLOUDINARY_RETENTION_API_SECRET/u);
assert.match(retentionCommand, /mediaResult\.failed > 0/u);
assert.match(mediaRunbook, /real Cloudinary deletion\/invalidation rehearsal/u);
assert.match(schedule, /destroyed through a job-scoped Cloudinary credential/u);

const pendingRehearsalSentinels = [
  "- Status: `Not run`",
  "- Environment, provider accounts and release revision: `Not recorded`",
  "- Approved schedule, lawful-basis and legal-hold reference: `Not approved`",
  "- Exercise window, incident owner and observers: `Not scheduled`",
  "- Synthetic dataset and non-production identifiers: `Not recorded`",
  "- MongoDB TTL indexes and monitor deployment evidence: `Not recorded`",
  "- Contact, media enquiry, Press Kit and Living Dossier expiry result: `Not run`",
  "- Protocol Desk pseudonymisation and correspondence cleanup result: `Not run`",
  "- Room primary deletion and content-free evidence result: `Not run`",
  "- Governed media quarantine, Cloudinary destruction and CDN invalidation result: `Not run`",
  "- Scheduler, retention-job and least-privilege identity evidence: `Not recorded`",
  "- Alert delivery, acknowledgement and escalation timestamps: `Not recorded`",
  "- Controlled provider outage, retry and fail-closed result: `Not run`",
  "- Restored-backup cutoff and deletion reconciliation result: `Not run`",
  "- Aggregate before/after counts and elapsed times: `Not recorded`",
  "- Personal-data, ciphertext, media-object and log non-disclosure review: `Not run`",
  "- Synthetic record/object cleanup and temporary-access revocation: `Not run`",
  "- Defects, remediation owners/dates and retest evidence: `None recorded`",
  "- Legal/Data Protection approval/date: `Not approved`",
  "- Operations approval/date: `Not approved`",
  "- Security approval/date: `Not approved`",
];

function validatePendingRehearsal(candidate) {
  for (const sentinel of pendingRehearsalSentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Retention rehearsal no longer proves the pre-execution state: ${sentinel}`,
    );
}

validatePendingRehearsal(rehearsal);
for (const sentinel of pendingRehearsalSentinels) {
  assert.throws(
    () =>
      validatePendingRehearsal(
        rehearsal.replace(sentinel, "[prematurely changed]"),
      ),
    undefined,
    `Retention rehearsal accepted mutation of required sentinel: ${sentinel}`,
  );
}
for (const [candidate, link] of [
  [ttlRunbook, "templates/retention-deletion-rehearsal-record.md"],
  [mediaRunbook, "templates/retention-deletion-rehearsal-record.md"],
  [handover, "../operations/templates/retention-deletion-rehearsal-record.md"],
])
  assert.ok(
    candidate.includes(link),
    `Missing retention rehearsal link: ${link}`,
  );

for (const staleFixture of [
  schedule.replace(
    "Implemented for the current inline encrypted envelope",
    "Not implemented",
  ),
  schedule.replace("180 days (`Brief`)", "365 days (`Brief`)"),
]) {
  assert.throws(() => validateRoomRetentionDocumentation(staleFixture));
}

process.stdout.write(
  `Privacy schedule matches Room and governed-media deletion controls; two Room drift fixtures and ${pendingRehearsalSentinels.length} rehearsal evidence mutations fail closed.\n`,
);
