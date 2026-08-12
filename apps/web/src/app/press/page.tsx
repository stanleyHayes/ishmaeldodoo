import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  PressRoom,
  identityAssetIds,
} from "../../components/content/press-room";
import { getPublicContent } from "../../lib/content/get-public-content";
import { getPublicMedia } from "../../lib/content/get-public-media";
import { pageAlternates } from "../../lib/content/public-pages";
import { identityPayload } from "../../lib/content/identity-payload";
import { publicMetadata } from "../../lib/discoverability/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicContent({
    documentType: "identity",
    documentId: "canonical",
    locale: "en-GB",
  });
  const identity =
    result.status === "available"
      ? identityPayload(result.content.payload)
      : null;
  return publicMetadata({
    title: identity ? `${identity.displayName} — Press Room` : undefined,
    description: identity?.bio40,
    ...pageAlternates("press"),
    locale: "en-GB",
    indexable: Boolean(identity),
  });
}

export default async function PressPage() {
  const lite = (await headers()).get("x-amanor-lite") === "1";
  const result = await getPublicContent({
    documentType: "identity",
    documentId: "canonical",
    locale: "en-GB",
  });
  const portraits = await Promise.all(
    identityAssetIds(result).map((assetId) => getPublicMedia(assetId, "en-GB")),
  );
  return (
    <PressRoom
      result={result}
      portraits={portraits}
      locale="en-GB"
      lite={lite}
    />
  );
}
