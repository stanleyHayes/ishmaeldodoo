import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const phases = new Set(["runtime", "migration-job", "retention-job"]);
const requirements = new Set([
  "production",
  "when-enabled",
  "when-room-enabled",
  "release-job",
  "scheduled-job",
]);

function validateInventory(contract, inventory, examples) {
  if (inventory.schemaVersion !== 1)
    throw new Error("Secret inventory schema version must be 1");
  for (const policy of [
    "providerSecretManagerRequired",
    "environmentIsolationRequired",
  ])
    if (inventory.custodyPolicy?.[policy] !== true)
      throw new Error(`Secret custody policy must require ${policy}`);
  if (
    inventory.custodyPolicy?.sourceControlAllowed !== false ||
    inventory.custodyPolicy?.frontendBuildSecretsAllowed !== false ||
    inventory.custodyPolicy?.evidenceMayContainValues !== false
  )
    throw new Error(
      "Secret values must be excluded from source, builds and evidence",
    );

  const deployableNames = Object.keys(inventory.deployables ?? {});
  if (JSON.stringify(deployableNames) !== JSON.stringify(contract.deployables))
    throw new Error(
      "Secret inventory must preserve web, admin and API deployables",
    );

  const variablesByConsumer = new Map();
  for (const [name, entry] of Object.entries(inventory.classes ?? {})) {
    if (!deployableNames.includes(entry.consumer))
      throw new Error(`${name} has an unknown consumer`);
    if (!phases.has(entry.phase) || !requirements.has(entry.required))
      throw new Error(`${name} has an invalid phase or requirement`);
    if (
      !entry.rotation ||
      !Array.isArray(entry.variables) ||
      !entry.variables.length
    )
      throw new Error(`${name} must define variables and rotation`);
    if (
      !Array.isArray(entry.secretVariables) ||
      entry.secretVariables.some(
        (variable) => !entry.variables.includes(variable),
      )
    )
      throw new Error(`${name} has invalid secretVariables`);
    if (
      entry.secretVariables.some((variable) =>
        variable.startsWith("NEXT_PUBLIC_"),
      )
    )
      throw new Error(`${name} exposes a secret to a browser bundle`);
    for (const variable of entry.variables) {
      if (!/^[A-Z][A-Z0-9_]+$/u.test(variable))
        throw new Error(`${name} contains an invalid environment variable`);
      const key = `${entry.consumer}:${variable}`;
      const prior = variablesByConsumer.get(key);
      if (prior && prior !== name)
        throw new Error(`${key} is ambiguously owned by ${prior} and ${name}`);
      variablesByConsumer.set(key, name);
    }
  }

  for (const deployable of deployableNames) {
    const expected = contract.requiredSecretClasses?.[deployable] ?? [];
    const declared = inventory.deployables[deployable].secretClasses;
    if (JSON.stringify(declared) !== JSON.stringify(expected))
      throw new Error(
        `${deployable} secret classes drifted from deployment contract`,
      );
    for (const name of declared) {
      if (inventory.classes?.[name]?.consumer !== deployable)
        throw new Error(`${deployable} does not own secret class ${name}`);
    }
  }
  if (inventory.deployables.admin.secretClasses.length)
    throw new Error("Admin/CMS must not receive server secrets");

  for (const variable of inventory.deployables.web.publicBuildVariables)
    if (!variable.startsWith("NEXT_PUBLIC_"))
      throw new Error(`Web public build variable ${variable} is not explicit`);
  for (const variable of inventory.deployables.admin.publicBuildVariables)
    if (!variable.startsWith("NEXT_PUBLIC_"))
      throw new Error(
        `Admin public build variable ${variable} is not explicit`,
      );

  for (const [name, requiredPhase] of [
    ["mongodb_migration", "migration-job"],
    ["mongodb_retention", "retention-job"],
  ])
    if (inventory.classes[name]?.phase !== requiredPhase)
      throw new Error(`${name} must stay out of the long-running API runtime`);

  for (const [deployable, definition] of Object.entries(
    inventory.deployables,
  )) {
    const requiredVariables = [
      ...definition.publicBuildVariables,
      ...definition.secretClasses.flatMap(
        (name) => inventory.classes[name].variables,
      ),
    ];
    for (const variable of new Set(requiredVariables))
      if (!new RegExp(`^${variable}=`, "mu").test(examples[deployable]))
        throw new Error(`${deployable}/.env.example is missing ${variable}`);
  }
}

const contract = JSON.parse(
  await readFile("infra/deployment/environment-contract.json", "utf8"),
);
const inventory = JSON.parse(
  await readFile("infra/deployment/secret-inventory.json", "utf8"),
);
const examples = {
  web: await readFile("apps/web/.env.example", "utf8"),
  admin: await readFile("apps/admin/.env.example", "utf8"),
  api: await readFile("apps/api/.env.example", "utf8"),
};

const custodyRecord = await readFile(
  "docs/security/templates/provider-secret-custody-rotation-record.md",
  "utf8",
);
const custodyGuide = await readFile(
  "docs/operations/deployment-secret-inventory.md",
  "utf8",
);
const rotationGuide = await readFile(
  "docs/security/secret-rotation.md",
  "utf8",
);

const pendingCustodySentinels = [
  "- Status: `Not run`",
  "- Environment, release and immutable source revision: `Not recorded`",
  "- Render, Vercel and provider accounts/regions: `Not recorded`",
  "- Exercise window, timezone, operators and independent observer: `Not scheduled`",
  "- Named primary/secondary custodians and approval authorities: `Not assigned`",
  "- Provider secret-manager resource and audit-export locations: `Not recorded`",
  "- Break-glass owner, access method, expiry and revocation evidence: `Not recorded`",
  "- Workload-identity availability and exception decisions: `Not assessed`",
  "- Cross-environment resource/value isolation evidence: `Not run`",
  "- Repository, build-log, image, artifact and frontend-bundle non-disclosure: `Not run`",
  "- Admin/CMS receives no server secret: `Not run`",
  "- JWT active/retiring key overlap and post-window removal: `Not run`",
  "- Session-pepper overlap, legacy refresh and invitation drain: `Not run`",
  "- MFA re-encryption aggregate report complete and safe to retire: `Not run`",
  "- Service-HMAC and revalidation key-ring overlap: `Not run`",
  "- MongoDB application/Room/job grant-denial proof after rotation: `Not run`",
  "- Cloudinary runtime/retention credential separation and rotation: `Not run`",
  "- Email, calendar and metrics dual-credential continuity: `Not run`",
  "- Job credentials absent from long-running API and frontends: `Not run`",
  "- Old versions disabled/revoked after validated drain: `Not run`",
  "- Rollback restores service without resurrecting superseded access: `Not run`",
  "- Alert, audit-log and incident-route evidence: `Not run`",
  "- Temporary access removed and break-glass path resealed: `Not run`",
  "- Defects, severity, owners, target dates and retest evidence: `None recorded`",
  "- Security approval and date: `Not approved`",
  "- Operations approval and date: `Not approved`",
  "- Privacy approval and date: `Not approved`",
  "- Product acceptance and date: `Not approved`",
];

function validatePendingCustodyRecord(candidate) {
  for (const sentinel of pendingCustodySentinels)
    assert.ok(
      candidate.includes(sentinel),
      `Provider custody record no longer proves its pending state: ${sentinel}`,
    );
  for (const className of Object.keys(inventory.classes)) {
    const row = new RegExp(
      `^\\| \\x60${className}\\x60\\s+\\| Not recorded\\s+\\| Not recorded\\s+\\| Not recorded\\s+\\| Not run\\s+\\| Not assessed \\|$`,
      "mu",
    );
    assert.ok(
      row.test(candidate),
      `Provider custody record lost exact inventory row ${className}`,
    );
  }
}

validatePendingCustodyRecord(custodyRecord);
for (const sentinel of pendingCustodySentinels) {
  const mutated = custodyRecord.replace(sentinel, "[prematurely changed]");
  assert.throws(
    () => validatePendingCustodyRecord(mutated),
    undefined,
    `Provider custody record accepted mutation of required sentinel: ${sentinel}`,
  );
}
for (const className of Object.keys(inventory.classes)) {
  const row = new RegExp(
    `^\\| \\x60${className}\\x60\\s+\\| Not recorded\\s+\\| Not recorded\\s+\\| Not recorded\\s+\\| Not run\\s+\\| Not assessed \\|$`,
    "mu",
  );
  const mutated = custodyRecord.replace(row, "[missing inventory row]");
  assert.throws(
    () => validatePendingCustodyRecord(mutated),
    undefined,
    `Provider custody record accepted removal of inventory row ${className}`,
  );
}
for (const document of [custodyGuide, rotationGuide])
  assert.ok(
    document.includes("provider-secret-custody-rotation-record.md"),
    "Secret custody/rotation guidance must link the controlled record",
  );

validateInventory(contract, inventory, examples);

const rejectedFixtures = [
  {
    name: "Admin server secret",
    mutate(fixtureContract, fixtureInventory) {
      fixtureContract.requiredSecretClasses.admin = ["admin_session_secret"];
      fixtureInventory.deployables.admin.secretClasses = [
        "admin_session_secret",
      ];
      fixtureInventory.classes.admin_session_secret = {
        consumer: "admin",
        phase: "runtime",
        required: "production",
        variables: ["ADMIN_SESSION_SECRET"],
        secretVariables: ["ADMIN_SESSION_SECRET"],
        rotation: "dual-credential",
      };
    },
    pattern: /Admin\/CMS must not receive server secrets/u,
  },
  {
    name: "browser-exposed secret",
    mutate(_fixtureContract, fixtureInventory) {
      const entry = fixtureInventory.classes.public_service_signing;
      entry.variables.push("NEXT_PUBLIC_SERVICE_SECRET");
      entry.secretVariables.push("NEXT_PUBLIC_SERVICE_SECRET");
    },
    pattern: /exposes a secret to a browser bundle/u,
  },
  {
    name: "ambiguous ownership",
    mutate(_fixtureContract, fixtureInventory) {
      fixtureInventory.classes.revalidation_verification.variables.push(
        "PUBLIC_SERVICE_SECRET",
      );
    },
    pattern: /ambiguously owned/u,
  },
  {
    name: "migration credential in API runtime",
    mutate(_fixtureContract, fixtureInventory) {
      fixtureInventory.classes.mongodb_migration.phase = "runtime";
    },
    pattern: /must stay out of the long-running API runtime/u,
  },
  {
    name: "missing environment declaration",
    mutate(_fixtureContract, _fixtureInventory, fixtureExamples) {
      fixtureExamples.api = fixtureExamples.api.replace(
        /^METRICS_BEARER_TOKEN=.*$/mu,
        "",
      );
    },
    pattern: /api\/\.env\.example is missing METRICS_BEARER_TOKEN/u,
  },
];

for (const fixture of rejectedFixtures) {
  const fixtureContract = structuredClone(contract);
  const fixtureInventory = structuredClone(inventory);
  const fixtureExamples = structuredClone(examples);
  fixture.mutate(fixtureContract, fixtureInventory, fixtureExamples);
  assert.throws(
    () => validateInventory(fixtureContract, fixtureInventory, fixtureExamples),
    fixture.pattern,
    `${fixture.name} fixture was not rejected`,
  );
}

process.stdout.write(
  `Environment inventory assigns ${Object.keys(inventory.classes).length} secret classes across ${Object.keys(inventory.deployables).length} deployables with no Admin or browser-build secrets; ${rejectedFixtures.length} dangerous drift fixtures, ${pendingCustodySentinels.length} pending-state mutations and ${Object.keys(inventory.classes).length} missing custody rows rejected.\n`,
);
