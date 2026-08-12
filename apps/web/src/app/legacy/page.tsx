import type { Metadata } from "next";
import {
  EditorialPage,
  readPageMetadata,
} from "../../components/content/editorial-page";
import { LegacyScholars } from "../../components/content/legacy-scholars";
import { getPublicContent } from "../../lib/content/get-public-content";
import { getPublicLegacy } from "../../lib/content/get-public-legacy";
import { pageAlternates } from "../../lib/content/public-pages";
import { publicMetadata } from "../../lib/discoverability/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const page = readPageMetadata(
    await getPublicContent({
      documentType: "page",
      documentId: "legacy",
      locale: "en-GB",
    }),
  );
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...pageAlternates("legacy"),
    locale: "en-GB",
    indexable: !page.noIndex,
  });
}

export default async function LegacyPage() {
  const [content, legacy] = await Promise.all([
    getPublicContent({
      documentType: "page",
      documentId: "legacy",
      locale: "en-GB",
    }),
    getPublicLegacy("en-GB"),
  ]);
  return (
    <EditorialPage result={content} path="/legacy" locale="en-GB">
      {legacy.status === "available" ? (
        <LegacyScholars legacy={legacy} locale="en-GB" />
      ) : (
        <p className="register-state">
          The published scholar register is temporarily unavailable.
        </p>
      )}
    </EditorialPage>
  );
}
