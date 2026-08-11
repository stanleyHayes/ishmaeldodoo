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
function validateDecisionRegister(candidate) {
  if (
    candidate.schemaVersion !== 1 ||
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
      decision.decider,
      decision.decidedAt,
      decision.evidence,
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
      for (const [field, value] of Object.entries({
        decisionDetail: decision.decisionDetail,
        decider: decision.decider,
        decidedAt: decision.decidedAt,
        evidence: decision.evidence,
      }))
        if (typeof value !== "string" || value.trim().length < 3)
          throw new Error(`${decision.id} is missing ${field}`);
      if (!/^20\d{2}-\d{2}-\d{2}$/u.test(decision.decidedAt))
        throw new Error(`${decision.id} decidedAt must be an ISO date`);
      if (decision.decidedAt < candidate.updatedAt)
        throw new Error(`${decision.id} predates the controlled register`);
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
    decider: "Test Principal",
    decidedAt: register.updatedAt,
    evidence: "signed-test-record",
  };
});

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
  `Decision register contains ${register.decisions.length} controlled records; ${unresolved} await authorized stakeholder evidence; four fail-closed fixtures and documentation mapping passed.\n`,
);
