import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  EditorialPage,
  readPageMetadata,
} from "../../components/content/editorial-page";
import { getPublicContent } from "../../lib/content/get-public-content";
import {
  pageAlternates,
  publicPageId,
  type PublicPagePath,
} from "../../lib/content/public-pages";
import { ProtocolDeskForm } from "../../components/content/protocol-desk-form";
import { publicMetadata } from "../../lib/discoverability/metadata";

type RouteProps = Readonly<{ params: Promise<{ slug: string[] }> }>;

export async function generateMetadata({
  params,
}: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const documentId = publicPageId(slug);
  if (!documentId) return {};
  const result = await getPublicContent({
    documentType: "page",
    documentId,
    locale: "en-GB",
  });
  const page = readPageMetadata(result);
  const alternates = pageAlternates(slug.join("/") as PublicPagePath);
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...alternates,
    locale: "en-GB",
    indexable: !page.noIndex,
  });
}

export default async function EnglishEditorialRoute({ params }: RouteProps) {
  const { slug } = await params;
  const documentId = publicPageId(slug);
  if (!documentId) notFound();
  const result = await getPublicContent({
    documentType: "page",
    documentId,
    locale: "en-GB",
  });
  const path = slug.join("/");
  return (
    <EditorialPage result={result} path={`/${path}`} locale="en-GB">
      {path === "speaking/request" ? <ProtocolDeskForm locale="en-GB" /> : null}
    </EditorialPage>
  );
}
