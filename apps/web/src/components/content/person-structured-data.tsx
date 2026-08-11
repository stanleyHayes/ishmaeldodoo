import { resolveDateRangedRecord } from "@amanor/contracts";
import type { PublicContentResult } from "../../lib/content/public-content-client";
import { identityPayload } from "../../lib/content/identity-payload";

export function PersonStructuredData({
  result,
  baseUrl,
}: Readonly<{ result: PublicContentResult; baseUrl: string }>) {
  const identity =
    result.status === "available"
      ? identityPayload(result.content.payload)
      : null;
  const current = identity
    ? resolveDateRangedRecord(identity.titleHistory)
    : undefined;
  if (!identity?.givenName || !identity.familyName || !current) return null;
  const base = baseUrl.replace(/\/$/u, "");
  const organisationId = `${base}/#current-organisation`;
  const organisation = {
    "@type": "Organization",
    "@id": organisationId,
    name: current.organisation,
  };
  const person = {
    "@type": "Person",
    "@id": `${base}/#person`,
    name: identity.displayName,
    givenName: identity.givenName,
    ...(identity.additionalName
      ? { additionalName: identity.additionalName }
      : {}),
    familyName: identity.familyName,
    honorificPrefix: identity.honorific,
    jobTitle: current.title,
    worksFor: { "@id": organisationId },
    nationality: identity.nationality,
    knowsLanguage: identity.languages,
    ...(identity.knowsAbout ? { knowsAbout: identity.knowsAbout } : {}),
    ...(identity.alumniOf
      ? {
          alumniOf: identity.alumniOf.map((name) => ({
            "@type": "EducationalOrganization",
            name,
          })),
        }
      : {}),
    ...(identity.sameAs ? { sameAs: identity.sameAs } : {}),
    url: `${base}/record`,
  };
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      person,
      organisation,
      {
        "@type": "ProfilePage",
        "@id": `${base}/record#profile`,
        url: `${base}/record`,
        mainEntity: { "@id": `${base}/#person` },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replaceAll("<", "\\u003c"),
      }}
    />
  );
}
