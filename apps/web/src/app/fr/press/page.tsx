import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  PressRoom,
  identityAssetIds,
} from "../../../components/content/press-room";
import { getPublicContent } from "../../../lib/content/get-public-content";
import { getPublicMedia } from "../../../lib/content/get-public-media";
import { pageAlternates } from "../../../lib/content/public-pages";
import { identityPayload } from "../../../lib/content/identity-payload";
import { publicMetadata } from "../../../lib/discoverability/metadata";

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
    title: identity ? `${identity.displayName} — Salle de presse` : undefined,
    description: identity?.bio40,
    ...pageAlternates("press", "fr-FR"),
    locale: "fr-FR",
    indexable: Boolean(identity),
  });
}

export default async function FrenchPressPage() {
  const lite = (await headers()).get("x-amanor-lite") === "1";
  const result = await getPublicContent({
    documentType: "identity",
    documentId: "canonical",
    locale: "fr-FR",
  });
  const portraits = await Promise.all(
    identityAssetIds(result).map((assetId) => getPublicMedia(assetId, "fr-FR")),
  );
  return (
    <PressRoom
      result={result}
      portraits={portraits}
      locale="fr-FR"
      lite={lite}
    />
  );
}
