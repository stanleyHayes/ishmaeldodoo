import type { Metadata } from "next";
import { SignalBoard } from "../../../components/content/signal-board";
import {
  EditorialPage,
  readPageMetadata,
} from "../../../components/content/editorial-page";
import { getPublicContent } from "../../../lib/content/get-public-content";
import { getPublicSignals } from "../../../lib/content/get-public-signals";
import { pageAlternates } from "../../../lib/content/public-pages";
import { publicMetadata } from "../../../lib/discoverability/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const page = readPageMetadata(
    await getPublicContent({
      documentType: "page",
      documentId: "signals",
      locale: "fr-FR",
    }),
  );
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...pageAlternates("signals", "fr-FR"),
    locale: "fr-FR",
    indexable: !page.noIndex,
  });
}

export default async function FrenchSignalsPage() {
  const [content, signals] = await Promise.all([
    getPublicContent({
      documentType: "page",
      documentId: "signals",
      locale: "fr-FR",
    }),
    getPublicSignals("fr-FR"),
  ]);
  return (
    <EditorialPage result={content} path="/signals" locale="fr-FR">
      {signals.status === "available" ? (
        <SignalBoard signals={signals} locale="fr-FR" />
      ) : (
        <p className="register-state">
          Le tableau des signaux publié est temporairement indisponible.
        </p>
      )}
    </EditorialPage>
  );
}
