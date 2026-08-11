import { AtlasTablePage } from "../../../../../components/content/atlas-table-page";
import { atlasFilters } from "../../../../../lib/content/atlas-filters";
import { getPublicAtlas } from "../../../../../lib/content/get-public-atlas";
import { pageAlternates } from "../../../../../lib/content/public-pages";
import { publicMetadata } from "../../../../../lib/discoverability/metadata";

export const metadata: Metadata = publicMetadata({
  title: "Atlas du parcours — tableau accessible",
  description: "Vue en tableau accessible du parcours public publié.",
  ...pageAlternates("record/atlas", "fr-FR"),
  locale: "fr-FR",
  indexable: false,
});
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <AtlasTablePage
      result={await getPublicAtlas("fr-FR")}
      locale="fr-FR"
      filters={atlasFilters(await searchParams)}
    />
  );
}
import type { Metadata } from "next";
