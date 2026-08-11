import type { Metadata } from "next";
import { ArchiveRegister } from "../../../components/content/archive-register";
import {
  EditorialPage,
  readPageMetadata,
} from "../../../components/content/editorial-page";
import { getPublicArchive } from "../../../lib/content/get-public-archive";
import { getPublicContent } from "../../../lib/content/get-public-content";
import { identityPayload } from "../../../lib/content/identity-payload";
import { pageAlternates } from "../../../lib/content/public-pages";
import { publicMetadata } from "../../../lib/discoverability/metadata";
import { webEnvironment } from "../../../lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const page = readPageMetadata(
    await getPublicContent({
      documentType: "page",
      documentId: "archive",
      locale: "fr-FR",
    }),
  );
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...pageAlternates("archive", "fr-FR"),
    locale: "fr-FR",
    indexable: !page.noIndex,
  });
}

export default async function FrenchArchivePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const parameters = await searchParams;
  const query =
    typeof parameters.q === "string" ? parameters.q.trim().slice(0, 100) : "";
  const type =
    typeof parameters.type === "string" ? parameters.type : undefined;
  const [content, archive, identity] = await Promise.all([
    getPublicContent({
      documentType: "page",
      documentId: "archive",
      locale: "fr-FR",
    }),
    getPublicArchive("fr-FR", {
      ...(query ? { query } : {}),
      ...(type ? { type } : {}),
    }),
    getPublicContent({
      documentType: "identity",
      documentId: "canonical",
      locale: "fr-FR",
    }),
  ]);
  const speaker =
    identity.status === "available"
      ? identityPayload(identity.content.payload)
      : null;
  return (
    <EditorialPage result={content} path="/archive" locale="fr-FR">
      {archive.status === "available" ? (
        <ArchiveRegister
          archive={archive}
          locale="fr-FR"
          query={query}
          {...(type ? { type } : {})}
          baseUrl={webEnvironment.PUBLIC_WEB_BASE_URL}
          {...(speaker ? { speakerName: speaker.displayName } : {})}
        />
      ) : (
        <p className="register-state">
          Les archives publiées sont temporairement indisponibles.
        </p>
      )}
    </EditorialPage>
  );
}
