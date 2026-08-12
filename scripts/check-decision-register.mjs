import { readFile, readdir } from "node:fs/promises";

const register = JSON.parse(
  await readFile("docs/governance/decision-register.json", "utf8"),
);
const agentPlan = await readFile("agent_plan.md", "utf8");
const workshop = await readFile("docs/governance/decision-workshop.md", "utf8");
const documentationFiles = (await readdir("docs", { recursive: true }))
  .filter((path) => /\.(?:json|md)$/u.test(path))
  .map((path) => `docs/${path}`);
const expectedIds = [
  ...Array.from(
    { length: 11 },
    (_, index) => `D${String(index + 1).padStart(2, "0")}`,
  ),
  ...Array.from(
    { length: 7 },
    (_, index) => `S${String(index + 1).padStart(2, "0")}`,
  ),
];
const isEvidenceReference = (value) => {
  if (typeof value !== "string") return false;
  if (
    value.startsWith("docs/governance/evidence/") &&
    documentationFiles.includes(value)
  )
    return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
function validateDecisionRegister(candidate) {
  if (
    candidate.schemaVersion !== 2 ||
    !["awaiting-stakeholders", "partially-decided", "decided"].includes(
      candidate.registerStatus,
    ) ||
    !/^20\d{2}-\d{2}-\d{2}$/u.test(candidate.updatedAt) ||
    !Array.isArray(candidate.decisions)
  )
    throw new Error("Decision register schema is invalid");
  const ids = candidate.decisions.map((decision) => decision.id);
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds))
    throw new Error(
      "Decision register must contain ordered D01-D11 and S01-S07 records",
    );

  for (const decision of candidate.decisions) {
    if (
      !decision.title ||
      !Array.isArray(decision.authority) ||
      !decision.authority.length
    )
      throw new Error(`${decision.id} is missing title or authority`);
    if (!Array.isArray(decision.options) || decision.options.length < 2)
      throw new Error(`${decision.id} must provide bounded options`);
    if (new Set(decision.options).size !== decision.options.length)
      throw new Error(`${decision.id} has duplicate options`);
    if (
      !Array.isArray(decision.affectedTasks) ||
      !decision.affectedTasks.length
    )
      throw new Error(`${decision.id} is missing affected tasks`);
    if (decision.affectedTasks.some((task) => !/^AMANOR-\d{3}$/u.test(task)))
      throw new Error(`${decision.id} has an invalid task reference`);
    if (
      decision.affectedTasks.some((task) => !agentPlan.includes(`| ${task} |`))
    )
      throw new Error(
        `${decision.id} references a task absent from agent_plan.md`,
      );
    if (!["pending", "approved", "deferred"].includes(decision.status))
      throw new Error(`${decision.id} has an invalid status`);

    const outcomeFields = [
      decision.selected,
      decision.decisionDetail,
      decision.approvals,
    ];
    if (
      decision.status === "pending" &&
      outcomeFields.some((value) => value !== null)
    )
      throw new Error(
        `${decision.id} is pending but contains an unapproved outcome`,
      );
    if (decision.status !== "pending") {
      if (!decision.options.includes(decision.selected))
        throw new Error(
          `${decision.id} selected value is not an allowed option`,
        );
      if (
        typeof decision.decisionDetail !== "string" ||
        decision.decisionDetail.trim().length < 3
      )
        throw new Error(`${decision.id} is missing decisionDetail`);
      if (!Array.isArray(decision.approvals))
        throw new Error(`${decision.id} is missing authority approvals`);
      if (
        decision.approvals.some(
          (approval) => !approval || typeof approval !== "object",
        )
      )
        throw new Error(`${decision.id} contains an invalid approval`);
      const approvalAuthorities = decision.approvals.map(
        (approval) => approval.authority,
      );
      if (
        new Set(approvalAuthorities).size !== approvalAuthorities.length ||
        JSON.stringify([...approvalAuthorities].sort()) !==
          JSON.stringify([...decision.authority].sort())
      )
        throw new Error(
          `${decision.id} approvals must exactly cover every required authority`,
        );
      for (const approval of decision.approvals) {
        for (const [field, value] of Object.entries({
          decider: approval.decider,
          decidedAt: approval.decidedAt,
        }))
          if (typeof value !== "string" || value.trim().length < 3)
            throw new Error(
              `${decision.id} ${approval.authority} approval is missing ${field}`,
            );
        if (!/^20\d{2}-\d{2}-\d{2}$/u.test(approval.decidedAt))
          throw new Error(
            `${decision.id} ${approval.authority} decidedAt must be an ISO date`,
          );
        if (approval.decidedAt < candidate.updatedAt)
          throw new Error(
            `${decision.id} ${approval.authority} approval predates the controlled register`,
          );
        if (!isEvidenceReference(approval.evidence))
          throw new Error(
            `${decision.id} ${approval.authority} approval evidence must be a durable HTTPS URL or committed governance-evidence path`,
          );
      }
    }
  }

  const unresolved = candidate.decisions.filter(
    (decision) => decision.status === "pending",
  ).length;
  const expectedStatus =
    unresolved === candidate.decisions.length
      ? "awaiting-stakeholders"
      : unresolved === 0
        ? "decided"
        : "partially-decided";
  if (candidate.registerStatus !== expectedStatus)
    throw new Error(
      `Decision register status must be ${expectedStatus} for its outcomes`,
    );

  return unresolved;
}

const clone = (value) => structuredClone(value);
const assertRejected = (name, mutate) => {
  const fixture = clone(register);
  mutate(fixture);
  try {
    validateDecisionRegister(fixture);
  } catch {
    return;
  }
  throw new Error(`Decision register negative fixture was accepted: ${name}`);
};

assertRejected("missing controlled decision", (fixture) => {
  fixture.decisions.pop();
});
assertRejected("pending decision with outcome", (fixture) => {
  fixture.decisions[0].selected = fixture.decisions[0].options[0];
});
assertRejected("approved decision without evidence", (fixture) => {
  fixture.decisions[0].status = "approved";
  fixture.decisions[0].selected = fixture.decisions[0].options[0];
});
assertRejected("selection outside bounded options", (fixture) => {
  fixture.decisions[0] = {
    ...fixture.decisions[0],
    status: "approved",
    selected: "uncontrolled-choice",
    decisionDetail: "Controlled test decision",
    approvals: [
      {
        authority: "principal",
        decider: "Test Principal",
        decidedAt: register.updatedAt,
        evidence: "signed-test-record",
      },
    ],
  };
});
assertRejected("missing required co-signature", (fixture) => {
  fixture.registerStatus = "partially-decided";
  fixture.decisions[11] = {
    ...fixture.decisions[11],
    status: "approved",
    selected: fixture.decisions[11].options[0],
    decisionDetail: "Controlled hosting decision",
    approvals: [
      {
        authority: "product",
        decider: "Test Product Lead",
        decidedAt: register.updatedAt,
        evidence: "signed-product-record",
      },
    ],
  };
});
assertRejected("duplicate authority approval", (fixture) => {
  fixture.registerStatus = "partially-decided";
  fixture.decisions[11] = {
    ...fixture.decisions[11],
    status: "approved",
    selected: fixture.decisions[11].options[0],
    decisionDetail: "Controlled hosting decision",
    approvals: [
      ...fixture.decisions[11].authority,
      fixture.decisions[11].authority[0],
    ].map((authority) => ({
      authority,
      decider: `Test ${authority}`,
      decidedAt: register.updatedAt,
      evidence: `signed-${authority}-record`,
    })),
  };
});
assertRejected("unauditable evidence label", (fixture) => {
  fixture.registerStatus = "partially-decided";
  fixture.decisions[0] = {
    ...fixture.decisions[0],
    status: "approved",
    selected: fixture.decisions[0].options[0],
    decisionDetail: "Controlled domain decision",
    approvals: [
      {
        authority: "principal",
        decider: "Test Principal",
        decidedAt: register.updatedAt,
        evidence: "signed-test-record",
      },
    ],
  };
});

const validMultiAuthorityFixture = clone(register);
validMultiAuthorityFixture.registerStatus = "partially-decided";
validMultiAuthorityFixture.decisions[11] = {
  ...validMultiAuthorityFixture.decisions[11],
  status: "approved",
  selected: validMultiAuthorityFixture.decisions[11].options[0],
  decisionDetail: "Controlled hosting decision",
  approvals: validMultiAuthorityFixture.decisions[11].authority.map(
    (authority) => ({
      authority,
      decider: `Test ${authority}`,
      decidedAt: register.updatedAt,
      evidence: `https://evidence.invalid/${authority}-record`,
    }),
  ),
};
if (validateDecisionRegister(validMultiAuthorityFixture) !== 17)
  throw new Error("Complete multi-authority approval fixture was rejected");

const unresolved = validateDecisionRegister(register);

if (!workshop.includes("Scope: D01-D11 and S01-S07"))
  throw new Error("Decision workshop scope has drifted from the register");
const workshopD11 = workshop.indexOf("1. D11 with the Principal");
const workshopDomain = workshop.indexOf("2. D01 domain");
const workshopProviders = workshop.indexOf("3. S01-S06 provider");
if (
  workshopD11 < 0 ||
  workshopDomain <= workshopD11 ||
  workshopProviders <= workshopDomain
)
  throw new Error(
    "Decision workshop must prioritize D11, then launch ownership, then staging providers",
  );
if (
  !agentPlan.includes("Resolve D01-D11 and S01-S07") ||
  !agentPlan.includes("Prioritise D11 first")
)
  throw new Error(
    "Immediate actions have drifted from the decision critical path",
  );

const controlledText = ["agent_plan.md", ...documentationFiles].map(
  async (path) => `${path}\n${await readFile(path, "utf8")}`,
);
const decisionReferences = (await Promise.all(controlledText)).join("\n");
const forbiddenMappings = [
  /D02\s+(?:Doctrine|Doctrine\/Positions)/iu,
  /Doctrine(?:\/Positions)?[^.\n;]{0,80}(?:pending|awaits|requires|decision-gated by)\s+D02/iu,
  /D03\s+(?:Signal|Signal\/Foresight|Foresight)/iu,
  /(?:Signal|Foresight)[^.\n;]{0,80}(?:pending|awaits|requires|decision-gated by)\s+D03/iu,
];
const driftFixtures = [
  "D02 Doctrine/Positions",
  "Doctrine remains disabled pending D02",
  "D03 Foresight",
  "Foresight remains disabled pending D03",
];
if (
  forbiddenMappings.some(
    (pattern, index) => !pattern.test(driftFixtures[index] ?? ""),
  ) ||
  forbiddenMappings.some((pattern) =>
    pattern.test("D02 Signal/Foresight; D03 Doctrine/Positions"),
  )
)
  throw new Error("Decision-reference drift fixtures are invalid");
if (forbiddenMappings.some((pattern) => pattern.test(decisionReferences)))
  throw new Error(
    "Controlled documentation drifted from D02 Signal/Foresight and D03 Doctrine/Positions",
  );

process.stdout.write(
  `Decision register contains ${register.decisions.length} controlled records; ${unresolved} await authorized stakeholder evidence; seven fail-closed fixtures, one complete multi-authority fixture and documentation mapping passed.\n`,
);
