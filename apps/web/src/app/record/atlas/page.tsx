import { AtlasPage } from "../../../components/content/atlas-page";
import { atlasFilters } from "../../../lib/content/atlas-filters";
import { getPublicAtlas } from "../../../lib/content/get-public-atlas";
import { webEnvironment } from "../../../lib/env";
import { ledgerView } from "../../../lib/content/ledger-view";
import { pageAlternates } from "../../../lib/content/public-pages";
import { publicMetadata } from "../../../lib/discoverability/metadata";

export const metadata: Metadata = publicMetadata({
  title: "Record Atlas",
  description: "Explore the published public record by place and time.",
  ...pageAlternates("record/atlas"),
  locale: "en-GB",
  indexable: true,
});
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <AtlasPage
      result={await getPublicAtlas("en-GB")}
      locale="en-GB"
      filters={atlasFilters(params)}
      tileUrl={webEnvironment.LEAFLET_TILE_URL}
      attribution={webEnvironment.LEAFLET_TILE_ATTRIBUTION}
      ledger={ledgerView(params)}
      lite={params.mode === "sahel" || params.lite === "1"}
      {...(typeof params.node === "string" ? { initialNode: params.node } : {})}
    />
  );
}
import type { Metadata } from "next";
