export type Identity = Readonly<{
  legalName: string;
  honorific: string;
  displayName: string;
  givenName?: string;
  additionalName?: string;
  familyName?: string;
  shortName: string;
  familiarName: string;
  pronunciationGuide: string;
  pronunciationAudio?: string;
  nationality: string;
  languages: readonly string[];
  location: string;
  titleHistory: readonly Readonly<{
    title: string;
    longFormTitle: string;
    organisation: string;
    from: string | Date;
    to: string | Date | null;
    sourceRef: string;
  }>[];
  bio40: string;
  bio120: string;
  bio300: string;
  portraits: readonly string[];
  sameAs?: readonly string[];
  alumniOf?: readonly string[];
  knowsAbout?: readonly string[];
  disambiguation?: string;
}>;

export function identityPayload(value: unknown): Identity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<Identity>;
  if (
    ![
      item.legalName,
      item.honorific,
      item.displayName,
      item.shortName,
      item.familiarName,
      item.pronunciationGuide,
      item.nationality,
      item.location,
      item.bio40,
      item.bio120,
      item.bio300,
    ].every((field) => typeof field === "string") ||
    !Array.isArray(item.languages) ||
    !Array.isArray(item.titleHistory) ||
    !Array.isArray(item.portraits)
  )
    return null;
  return item as Identity;
}
