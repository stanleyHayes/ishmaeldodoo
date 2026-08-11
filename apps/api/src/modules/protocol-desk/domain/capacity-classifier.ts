export const capacityClassifierVersion = "capacity-v1-conservative";

export type CapacityAssessment = Readonly<{
  classification: "official" | "personal" | "review";
  basis: "explicit" | "clarification";
  signals: readonly string[];
  prompts: readonly (
    | "official_channel_required"
    | "honorarium_suppressed"
    | "capacity_confirmation_required"
  )[];
  requiresHumanReview: boolean;
  version: typeof capacityClassifierVersion;
}>;

const officialTerms = [
  ["24-hour economy", "official:24-hour-economy"],
  ["24h+", "official:24h-plus"],
  ["authority", "official:authority"],
  ["office of the president", "official:presidency"],
  ["government", "official:government"],
  ["public office", "official:public-office"],
  ["official role", "official:role"],
] as const;
const personalTerms = [
  ["personal capacity", "personal:explicit-phrase"],
  ["independent practitioner", "personal:independent-practitioner"],
  ["private thought leader", "personal:thought-leader"],
] as const;

function signalsFor(
  value: string,
  terms: readonly (readonly [string, string])[],
): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-GB");
  return terms
    .filter(([term]) => normalized.includes(term))
    .map(([, signal]) => signal);
}

export function classifyCapacity(
  input: Readonly<{
    capacity: "official" | "personal" | "unsure";
    context?: string;
    funding?: string;
  }>,
): CapacityAssessment {
  if (input.capacity === "official")
    return {
      classification: "official",
      basis: "explicit",
      signals: ["requester:official"],
      prompts: ["official_channel_required", "honorarium_suppressed"],
      requiresHumanReview: false,
      version: capacityClassifierVersion,
    };
  if (input.capacity === "personal")
    return {
      classification: "personal",
      basis: "explicit",
      signals: ["requester:personal"],
      prompts: [],
      requiresHumanReview: false,
      version: capacityClassifierVersion,
    };
  const clarification = `${input.context ?? ""}\n${input.funding ?? ""}`;
  const officialSignals = signalsFor(clarification, officialTerms);
  const personalSignals = signalsFor(clarification, personalTerms);
  if (officialSignals.length > 0)
    return {
      classification: "official",
      basis: "clarification",
      signals: officialSignals,
      prompts: [
        "official_channel_required",
        "honorarium_suppressed",
        "capacity_confirmation_required",
      ],
      requiresHumanReview: true,
      version: capacityClassifierVersion,
    };
  if (personalSignals.length > 0)
    return {
      classification: "personal",
      basis: "clarification",
      signals: personalSignals,
      prompts: ["capacity_confirmation_required"],
      requiresHumanReview: true,
      version: capacityClassifierVersion,
    };
  return {
    classification: "review",
    basis: "clarification",
    signals: [],
    prompts: ["capacity_confirmation_required"],
    requiresHumanReview: true,
    version: capacityClassifierVersion,
  };
}
