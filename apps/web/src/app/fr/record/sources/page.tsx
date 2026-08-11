import type { Metadata } from "next";
import { SourceRegister } from "../../../../components/content/source-register";
import { getPublicSources } from "../../../../lib/content/get-public-sources";
import { pageAlternates } from "../../../../lib/content/public-pages";
import { publicMetadata } from "../../../../lib/discoverability/metadata";

export const metadata: Metadata = publicMetadata({
  title: "Registre des sources",
  description: "Sources publiées à l’appui du parcours public.",
  ...pageAlternates("record/sources", "fr-FR"),
  locale: "fr-FR",
  indexable: true,
});

export default async function FrenchSourcesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; cursor?: string }> }>) {
  const parameters = await searchParams;
  const query = parameters.q?.trim().slice(0, 100) ?? "";
  const result = await getPublicSources({
    locale: "fr-FR",
    ...(query ? { query } : {}),
    ...(parameters.cursor ? { cursor: parameters.cursor } : {}),
  });
  return <SourceRegister result={result} locale="fr-FR" query={query} />;
}
