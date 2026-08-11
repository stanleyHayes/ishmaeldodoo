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
    government: "You need someone who can convene institutions.",
    investor: "You are looking for structured, de-risked pipeline in Ghana.",
    media: "You are building a programme and need a speaker.",
    youth: "You want to know how someone gets from Bukom to global service.",
    philanthropy: "You want to fund a scholar.",
  },
  "fr-FR": {
    government:
      "Vous cherchez une personne capable de réunir les institutions.",
    investor: "Vous recherchez des projets structurés et dérisqués au Ghana.",
    media: "Vous préparez un programme et recherchez un intervenant.",
    youth: "Vous voulez comprendre le parcours de Bukom au service mondial.",
    philanthropy: "Vous souhaitez financer un boursier.",
  },
};
export type AdaptiveBlock =
  | "record"
  | "atlas"
  | "current"
  | "signal"
  | "invitation";

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
