import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  EditorialPage,
  readPageMetadata,
} from "../../../components/content/editorial-page";
import { getPublicContent } from "../../../lib/content/get-public-content";
import {
  pageAlternates,
  publicPageId,
  type PublicPagePath,
} from "../../../lib/content/public-pages";
import { ProtocolDeskForm } from "../../../components/content/protocol-desk-form";
import { publicMetadata } from "../../../lib/discoverability/metadata";

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
    locale: "fr-FR",
  });
  const page = readPageMetadata(result);
  const alternates = pageAlternates(slug.join("/") as PublicPagePath, "fr-FR");
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...alternates,
    locale: "fr-FR",
    indexable: !page.noIndex,
  });
}

export default async function FrenchEditorialRoute({ params }: RouteProps) {
  const { slug } = await params;
  const documentId = publicPageId(slug);
  if (!documentId) notFound();
  const result = await getPublicContent({
    documentType: "page",
    documentId,
    locale: "fr-FR",
  });
  const path = slug.join("/");
  return (
    <EditorialPage result={result} path={`/${path}`} locale="fr-FR">
      {path === "speaking/request" ? <ProtocolDeskForm locale="fr-FR" /> : null}
    </EditorialPage>
  );
}
