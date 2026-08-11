import type { EngagementRequest, RequestFlag } from "./engagement-request";
import { randomUUID } from "node:crypto";

export const triageEngineVersion = "triage-v1-advisory";

export type TriageDimension = Readonly<{
  key:
    | "institutional_weight"
    | "thematic_fit"
    | "strategic_value"
    | "feasibility"
    | "completeness_verification";
  score: number;
  weight: 30 | 25 | 20 | 15 | 10;
  factors: readonly string[];
}>;

export type TriageContext = Readonly<{
  screenedAt: Date;
  organisationDomainVerified: boolean;
  counterpartyMatches?: readonly string[];
  sensitivityMatches?: readonly string[];
  hasCalendarClash?: boolean;
  previousOutcome?: string;
  approvedThemeTerms?: readonly string[];
  liveAgendaTerms?: readonly string[];
}>;

export type TriageAssessment = Readonly<{
  score: number;
  dimensions: readonly TriageDimension[];
  flags: readonly RequestFlag[];
  requiresHumanReview: boolean;
  version: typeof triageEngineVersion;
  screenedAt: Date;
}>;

const leadWeeks: Readonly<
  Record<EngagementRequest["engagement"]["type"], number>
> = {
  keynote: 8,
  panel: 5,
  fireside: 5,
  institutional_briefing: 6,
  media_interview: 2,
  advisory: 10,
  academic: 8,
  youth: 4,
  written_contribution: 6,
};

const institutionScores: Readonly<
  Record<EngagementRequest["organisation"]["type"], number>
> = {
  government: 90,
  multilateral: 90,
  academic: 75,
  civil_society: 65,
  private_sector: 60,
  media: 60,
  other: 45,
};

const priorityCountries = new Set([
  "BF",
  "ML",
  "NE",
  "TD",
  "MR",
  "SN",
  "CI",
  "BJ",
  "TG",
  "GN",
  "SL",
]);

function bounded(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function textOf(request: EngagementRequest): string {
  return [
    request.ask.proposedTheme,
    request.ask.objective,
    request.ask.otherSpeakers,
    request.engagement.audienceDescription,
    request.organisation.convenors,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB");
}

function matches(text: string, terms: readonly string[]): readonly string[] {
  return terms
    .map((term) => term.trim().toLocaleLowerCase("en-GB"))
    .filter((term) => term.length >= 3 && text.includes(term));
}

export function assessTriage(
  request: EngagementRequest,
  context: TriageContext,
): TriageAssessment {
  const text = textOf(request);
  const seniorAudience =
    /\b(president|minister|head of state|chief executive|ceo|ambassador|commissioner)\b/u.test(
      text,
    );
  const institutionFactors = [`organisation:${request.organisation.type}`];
  let institutional = institutionScores[request.organisation.type];
  if (request.logistics.otherPrincipals) {
    institutional += 5;
    institutionFactors.push("other-principals");
  }
  if (seniorAudience) {
    institutional += 5;
    institutionFactors.push("senior-audience");
  }

  const themeMatches = matches(text, context.approvedThemeTerms ?? []);
  const agendaMatches = matches(text, context.liveAgendaTerms ?? []);
  const thematicFactors = [
    ...themeMatches.map((term) => `theme:${term}`),
    ...agendaMatches.map((term) => `agenda:${term}`),
  ];
  const thematic =
    themeMatches.length || agendaMatches.length
      ? 60 + Math.min(40, (themeMatches.length + agendaMatches.length - 1) * 10)
      : 25;

  const strategicFactors: string[] = [];
  let strategic = 40;
  if (priorityCountries.has(request.engagement.country)) {
    strategic += 35;
    strategicFactors.push("priority-geography");
  }
  if (/\b(diaspora|investor|investment|capital)\b/u.test(text)) {
    strategic += 15;
    strategicFactors.push("diaspora-or-investor-reach");
  }
  if (
    request.capacityAssessment.classification === "official" &&
    /\b(24h\+|24-hour economy|partnership|export)\b/u.test(text)
  ) {
    strategic += 10;
    strategicFactors.push("official-partnership-relevance");
  }

  const minimumDays = leadWeeks[request.engagement.type] * 7;
  const leadDays = Math.floor(
    (request.engagement.startsAt.getTime() - context.screenedAt.getTime()) /
      86_400_000,
  );
  const leadTimeShort = leadDays < minimumDays;
  const feasibilityFactors = [
    `lead-days:${leadDays}`,
    `minimum-days:${minimumDays}`,
  ];
  let feasibility = leadTimeShort
    ? bounded((leadDays / minimumDays) * 70)
    : 100;
  if (
    request.engagement.format !== "virtual" &&
    request.engagement.country !== "GH"
  ) {
    feasibility -= 10;
    feasibilityFactors.push("travel-from-accra");
  }
  if (context.hasCalendarClash) {
    feasibility = 0;
    feasibilityFactors.push("calendar-clash");
  }

  const completenessFactors = [
    context.organisationDomainVerified
      ? "domain-verified"
      : "domain-unverified",
    "named-contact",
  ];
  let completeness = context.organisationDomainVerified ? 85 : 45;
  if (request.organisation.website) completeness += 5;
  if (request.ask.otherSpeakers) completeness += 5;
  if (request.organisation.convenors) completeness += 5;

  const dimensions: readonly TriageDimension[] = [
    {
      key: "institutional_weight",
      score: bounded(institutional),
      weight: 30,
      factors: institutionFactors,
    },
    {
      key: "thematic_fit",
      score: bounded(thematic),
      weight: 25,
      factors: thematicFactors.length
        ? thematicFactors
        : ["no-governed-term-match"],
    },
    {
      key: "strategic_value",
      score: bounded(strategic),
      weight: 20,
      factors: strategicFactors.length ? strategicFactors : ["baseline"],
    },
    {
      key: "feasibility",
      score: bounded(feasibility),
      weight: 15,
      factors: feasibilityFactors,
    },
    {
      key: "completeness_verification",
      score: bounded(completeness),
      weight: 10,
      factors: completenessFactors,
    },
  ];
  const score = Math.round(
    dimensions.reduce(
      (total, dimension) => total + dimension.score * dimension.weight,
      0,
    ) / 100,
  );
  const flags: RequestFlag[] = [];
  const raise = (
    type: RequestFlag["type"],
    severity: RequestFlag["severity"],
    detail: string,
  ): void => {
    flags.push({
      flagId: randomUUID(),
      type,
      severity,
      detail,
      raisedAt: context.screenedAt,
    });
  };
  if (context.counterpartyMatches?.length)
    raise(
      "conflict",
      "blocking",
      `Governed counterparty match: ${context.counterpartyMatches.join(", ")}`,
    );
  if (leadTimeShort)
    raise(
      "lead_time",
      "review",
      `Lead time is ${leadDays} days; ${minimumDays} days required`,
    );
  if (!context.organisationDomainVerified)
    raise(
      "unverified",
      "review",
      "Requester email domain is not verified against the organisation website",
    );
  if (context.hasCalendarClash)
    raise(
      "clash",
      "review",
      "Requested date overlaps an existing hold or confirmed engagement",
    );
  if (context.sensitivityMatches?.length)
    raise(
      "sensitivity",
      "blocking",
      `Governed sensitivity term match: ${context.sensitivityMatches.join(", ")}`,
    );
  if (context.previousOutcome)
    raise(
      "repeat_requester",
      "notice",
      `Previous outcome: ${context.previousOutcome}`,
    );
  if (
    request.engagement.type === "advisory" &&
    !flags.some((flag) => flag.type === "conflict")
  )
    raise(
      "conflict",
      "blocking",
      "Advisory or board engagement requires mandatory human conflict review",
    );
  return {
    score,
    dimensions,
    flags,
    requiresHumanReview:
      flags.some((flag) => flag.severity === "blocking") ||
      request.capacityAssessment.requiresHumanReview,
    version: triageEngineVersion,
    screenedAt: context.screenedAt,
  };
}
