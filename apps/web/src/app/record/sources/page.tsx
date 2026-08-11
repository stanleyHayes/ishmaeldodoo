import type { Metadata } from "next";
import { SourceRegister } from "../../../components/content/source-register";
import { getPublicSources } from "../../../lib/content/get-public-sources";
import { pageAlternates } from "../../../lib/content/public-pages";
import { publicMetadata } from "../../../lib/discoverability/metadata";

export const metadata: Metadata = publicMetadata({
  title: "Source Register",
  description: "Published sources supporting the public record.",
  ...pageAlternates("record/sources"),
  locale: "en-GB",
  indexable: true,
});

export default async function SourcesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; cursor?: string }> }>) {
  const parameters = await searchParams;
  const query = parameters.q?.trim().slice(0, 100) ?? "";
  const result = await getPublicSources({
    locale: "en-GB",
    ...(query ? { query } : {}),
    ...(parameters.cursor ? { cursor: parameters.cursor } : {}),
  });
  return <SourceRegister result={result} locale="en-GB" query={query} />;
}
