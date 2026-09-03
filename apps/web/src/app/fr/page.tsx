import type { Metadata } from "next";
import FoundationPage from "../page";
import { getPublicContent } from "../../lib/content/get-public-content";
import { identityPayload } from "../../lib/content/identity-payload";
import { publicMetadata } from "../../lib/discoverability/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicContent({
    documentType: "identity",
    documentId: "canonical",
    locale: "fr-FR",
  });
  const identity =
    result.status === "available"
      ? identityPayload(result.content.payload)
      : null;
  return publicMetadata({
    title: identity?.displayName,
    description: identity?.bio40,
    canonical: "/fr",
    languages: { "en-GB": "/", "fr-FR": "/fr", "x-default": "/" },
    locale: "fr-FR",
    indexable: Boolean(identity),
  });
}

export default function FrenchFoundationPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return <FoundationPage locale="fr-FR" searchParams={searchParams} />;
}
