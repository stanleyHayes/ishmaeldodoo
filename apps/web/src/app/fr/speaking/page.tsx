import type { Metadata } from "next";
import {
  EditorialPage,
  readPageMetadata,
} from "../../../components/content/editorial-page";
import { SpeakingThemes } from "../../../components/content/speaking-themes";
import { getPublicContent } from "../../../lib/content/get-public-content";
import { getPublicSpeakingMedia } from "../../../lib/content/get-public-speaking-media";
import { getPublicSpeaking } from "../../../lib/content/get-public-speaking";
import { pageAlternates } from "../../../lib/content/public-pages";
import { publicMetadata } from "../../../lib/discoverability/metadata";
import { webEnvironment } from "../../../lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const page = readPageMetadata(
    await getPublicContent({
      documentType: "page",
      documentId: "speaking",
      locale: "fr-FR",
    }),
  );
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...pageAlternates("speaking", "fr-FR"),
    locale: "fr-FR",
    indexable: !page.noIndex,
  });
}

export default async function FrenchSpeakingPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const [content, speaking, parameters] = await Promise.all([
    getPublicContent({
      documentType: "page",
      documentId: "speaking",
      locale: "fr-FR",
    }),
    getPublicSpeaking("fr-FR"),
    searchParams,
  ]);
  const format =
    typeof parameters.format === "string" ? parameters.format : undefined;
  const lite = parameters.lite === "1";
  const mediaById =
    !lite && speaking.status === "available"
      ? await getPublicSpeakingMedia(speaking, "fr-FR")
      : {};
  return (
    <EditorialPage result={content} path="/speaking" locale="fr-FR">
      {speaking.status === "available" ? (
        <SpeakingThemes
          speaking={speaking}
          locale="fr-FR"
          lite={lite}
          baseUrl={webEnvironment.PUBLIC_WEB_BASE_URL}
          mediaById={mediaById}
          {...(format ? { format } : {})}
        />
      ) : (
        <p className="register-state">
          Les thèmes d’intervention publiés sont temporairement indisponibles.
        </p>
      )}
    </EditorialPage>
  );
}
