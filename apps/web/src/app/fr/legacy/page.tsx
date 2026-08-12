import type { Metadata } from "next";
import {
  EditorialPage,
  readPageMetadata,
} from "../../../components/content/editorial-page";
import { LegacyScholars } from "../../../components/content/legacy-scholars";
import { getPublicContent } from "../../../lib/content/get-public-content";
import { getPublicLegacy } from "../../../lib/content/get-public-legacy";
import { getPublicMedia } from "../../../lib/content/get-public-media";
import { pageAlternates } from "../../../lib/content/public-pages";
import { publicMetadata } from "../../../lib/discoverability/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const page = readPageMetadata(
    await getPublicContent({
      documentType: "page",
      documentId: "legacy",
      locale: "fr-FR",
    }),
  );
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...pageAlternates("legacy", "fr-FR"),
    locale: "fr-FR",
    indexable: !page.noIndex,
  });
}

export default async function LegacyPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const lite =
    (params.mode === "sahel" || params.lite === "1") && params.media !== "1";
  const [content, legacy] = await Promise.all([
    getPublicContent({
      documentType: "page",
      documentId: "legacy",
      locale: "fr-FR",
    }),
    getPublicLegacy("fr-FR"),
  ]);
  const portraits =
    legacy.status === "available" && !lite
      ? await Promise.all(
          legacy.scholars.flatMap((scholar) =>
            scholar.photo
              ? [
                  getPublicMedia(scholar.photo, "fr-FR").then((result) =>
                    result.status === "available"
                      ? ([scholar.photo as string, result.asset] as const)
                      : undefined,
                  ),
                ]
              : [],
          ),
        )
      : [];
  return (
    <EditorialPage result={content} path="/legacy" locale="fr-FR">
      {legacy.status === "available" ? (
        <LegacyScholars
          legacy={legacy}
          locale="fr-FR"
          lite={lite}
          media={Object.fromEntries(
            portraits.filter((entry) => entry !== undefined),
          )}
        />
      ) : (
        <p className="register-state">
          Le registre publié des chercheurs est temporairement indisponible.
        </p>
      )}
    </EditorialPage>
  );
}
