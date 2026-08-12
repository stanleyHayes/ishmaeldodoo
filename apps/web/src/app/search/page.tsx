import type { Metadata } from "next";
import { PublicSearch } from "../../components/content/public-search";
import { publicMetadata } from "../../lib/discoverability/metadata";

export const metadata: Metadata = publicMetadata({
  title: "Search",
  description: "Search the approved public sections of Project AMANOR.",
  canonical: "/search",
  languages: {
    "en-GB": "/search",
    "fr-FR": "/fr/search",
    "x-default": "/search",
  },
  locale: "en-GB",
  indexable: false,
});

export default async function SearchPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  return <PublicSearch locale="en-GB" query={(await searchParams).q} />;
}
