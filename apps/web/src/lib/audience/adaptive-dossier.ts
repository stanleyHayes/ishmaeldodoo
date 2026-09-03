export const audienceKeys = [
  "government",
  "investor",
  "media",
  "youth",
  "philanthropy",
] as const;

export type AudienceKey = (typeof audienceKeys)[number];

export const audienceDoorLabels: Readonly<
  Record<"en-GB" | "fr-FR", Record<AudienceKey, string>>
> = {
  "en-GB": {
    government: "I need to bring institutions together.",
    investor: "I am looking for investment opportunities in Ghana.",
    media: "I need a speaker or an informed perspective.",
    youth: "I want to understand his journey.",
    philanthropy: "I want to support a scholar.",
  },
  "fr-FR": {
    government: "Je souhaite réunir plusieurs institutions.",
    investor: "Je recherche des possibilités d’investissement au Ghana.",
    media: "Je cherche un intervenant ou un point de vue éclairé.",
    youth: "Je souhaite comprendre son parcours.",
    philanthropy: "Je souhaite soutenir un boursier.",
  },
};
export type AdaptiveBlock =
  "record" | "atlas" | "current" | "signal" | "invitation";

export const audienceCookieName = "amanor-audience";
export const audienceStorageName = "amanor-audience";
export const audienceMaxAgeSeconds = 60 * 60 * 24 * 30;

export function audienceKey(value: unknown): AudienceKey | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" &&
    audienceKeys.includes(candidate as AudienceKey)
    ? (candidate as AudienceKey)
    : null;
}

const defaultOrder: readonly AdaptiveBlock[] = [
  "record",
  "atlas",
  "current",
  "signal",
  "invitation",
];

const orders: Readonly<Record<AudienceKey, readonly AdaptiveBlock[]>> = {
  government: ["record", "current", "atlas", "signal", "invitation"],
  investor: ["atlas", "record", "current", "signal", "invitation"],
  media: ["current", "signal", "record", "atlas", "invitation"],
  youth: ["record", "signal", "atlas", "current", "invitation"],
  philanthropy: ["signal", "record", "atlas", "current", "invitation"],
};

export function adaptiveOrder(
  audience: AudienceKey | null,
): readonly AdaptiveBlock[] {
  return audience ? orders[audience] : defaultOrder;
}

export const audienceDoorsAnchor = "audience-heading";

const blockAnchors: Readonly<Record<AdaptiveBlock, string>> = {
  record: "home-record-heading",
  atlas: "atlas-preview-heading",
  current: "current-position-heading",
  signal: "home-signal-heading",
  invitation: "invitation-heading",
};

// A door is only useful if the click lands the visitor on something. Blocks
// collapse when their content is unpublished, so the destination is resolved
// against the blocks this render actually produced rather than the full order.
export function audienceDestination(
  audience: AudienceKey | null,
  rendered: readonly AdaptiveBlock[],
): string {
  const promoted = adaptiveOrder(audience).find((block) =>
    rendered.includes(block),
  );
  return promoted ? blockAnchors[promoted] : audienceDoorsAnchor;
}

export function audienceDestinations(
  rendered: readonly AdaptiveBlock[],
): Readonly<Record<AudienceKey, string>> {
  return {
    government: audienceDestination("government", rendered),
    investor: audienceDestination("investor", rendered),
    media: audienceDestination("media", rendered),
    youth: audienceDestination("youth", rendered),
    philanthropy: audienceDestination("philanthropy", rendered),
  };
}

export function atlasQuery(audience: AudienceKey | null): string {
  const theme: Partial<Record<AudienceKey, string>> = {
    government: "coordination",
    investor: "financing",
    media: "policy",
    philanthropy: "environment",
  };
  const parameters = new URLSearchParams();
  if (audience) parameters.set("door", audience);
  const selectedTheme = audience ? theme[audience] : undefined;
  if (selectedTheme) parameters.set("theme", selectedTheme);
  const query = parameters.toString();
  return query ? `?${query}` : "";
}

export function audienceCta(audience: AudienceKey | null): string {
  switch (audience) {
    case "government":
    case "investor":
      return "/contact#the-room";
    case "media":
      return "/speaking/request";
    case "youth":
      return "/office-hours";
    case "philanthropy":
      return "/legacy";
    default:
      return "/speaking/request";
  }
}
