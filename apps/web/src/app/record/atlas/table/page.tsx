import { AtlasTablePage } from "../../../../components/content/atlas-table-page";
import { atlasFilters } from "../../../../lib/content/atlas-filters";
import { getPublicAtlas } from "../../../../lib/content/get-public-atlas";
import { pageAlternates } from "../../../../lib/content/public-pages";
import { publicMetadata } from "../../../../lib/discoverability/metadata";

export const metadata: Metadata = publicMetadata({
  title: "Record Atlas — accessible table",
  description: "Accessible table view of the published public record.",
  ...pageAlternates("record/atlas"),
  locale: "en-GB",
  indexable: false,
});
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <AtlasTablePage
      result={await getPublicAtlas("en-GB")}
      locale="en-GB"
      filters={atlasFilters(await searchParams)}
    />
  );
}
import type { Metadata } from "next";
