import type { Metadata } from "next";
import { ContactForm } from "../../../components/content/contact-form";
import {
  EditorialPage,
  readPageMetadata,
} from "../../../components/content/editorial-page";
import { getPublicContent } from "../../../lib/content/get-public-content";
import { pageAlternates } from "../../../lib/content/public-pages";
import { publicMetadata } from "../../../lib/discoverability/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const page = readPageMetadata(
    await getPublicContent({
      documentType: "page",
      documentId: "contact",
      locale: "fr-FR",
    }),
  );
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...pageAlternates("contact", "fr-FR"),
    locale: "fr-FR",
    indexable: !page.noIndex,
  });
}

export default async function FrenchContactPage() {
  const content = await getPublicContent({
    documentType: "page",
    documentId: "contact",
    locale: "fr-FR",
  });
  return (
    <EditorialPage result={content} path="/contact" locale="fr-FR">
      <ContactForm locale="fr-FR" />
    </EditorialPage>
  );
}
