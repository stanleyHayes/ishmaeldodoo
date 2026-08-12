import type { Metadata } from "next";
import { PublicSearch } from "../../../components/content/public-search";
import { publicMetadata } from "../../../lib/discoverability/metadata";

export const metadata: Metadata = publicMetadata({
  title: "Recherche",
  description: "Recherchez les sections publiques approuvées du Projet AMANOR.",
  canonical: "/fr/search",
  languages: {
    "en-GB": "/search",
    "fr-FR": "/fr/search",
    "x-default": "/search",
  },
  locale: "fr-FR",
  indexable: false,
});

export default async function FrenchSearchPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  return <PublicSearch locale="fr-FR" query={(await searchParams).q} />;
}
