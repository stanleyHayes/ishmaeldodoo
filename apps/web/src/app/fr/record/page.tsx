import type { Metadata } from "next";
import { readPageMetadata } from "../../../components/content/editorial-page";
import {
  RecordPage,
  recordFieldImageIds,
} from "../../../components/content/record-page";
import { getPublicAtlas } from "../../../lib/content/get-public-atlas";
import { getPublicContent } from "../../../lib/content/get-public-content";
import { getPublicMedia } from "../../../lib/content/get-public-media";
import { ledgerView } from "../../../lib/content/ledger-view";
import { pageAlternates } from "../../../lib/content/public-pages";
import { publicMetadata } from "../../../lib/discoverability/metadata";
export async function generateMetadata(): Promise<Metadata> {
  const page = readPageMetadata(
    await getPublicContent({
      documentType: "page",
      documentId: "record",
      locale: "fr-FR",
    }),
  );
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...pageAlternates("record", "fr-FR"),
    locale: "fr-FR",
    indexable: !page.noIndex,
  });
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [content, atlas] = await Promise.all([
    getPublicContent({
      documentType: "page",
      documentId: "record",
      locale: "fr-FR",
    }),
    getPublicAtlas("fr-FR"),
  ]);
  const params = await searchParams;
  const lite =
    (params.mode === "lite" || params.lite === "1") && params.media !== "1";
  const media = Object.fromEntries(
    await Promise.all(
      (lite ? [] : recordFieldImageIds(content)).map(async (assetId) => {
        const result = await getPublicMedia(assetId, "fr-FR");
        return [
          assetId,
          result.status === "available" ? result.asset : undefined,
        ] as const;
      }),
    ),
  );
  return (
    <RecordPage
      result={content}
      atlas={atlas.status === "available" ? atlas.items : []}
      locale="fr-FR"
      ledger={ledgerView(params)}
      lite={lite}
      media={media}
    />
  );
}
