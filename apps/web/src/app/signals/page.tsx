import type { Metadata } from "next";
import { SignalBoard } from "../../components/content/signal-board";
import {
  EditorialPage,
  readPageMetadata,
} from "../../components/content/editorial-page";
import { getPublicContent } from "../../lib/content/get-public-content";
import { getPublicSignals } from "../../lib/content/get-public-signals";
import { pageAlternates } from "../../lib/content/public-pages";
import { publicMetadata } from "../../lib/discoverability/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const page = readPageMetadata(
    await getPublicContent({
      documentType: "page",
      documentId: "signals",
      locale: "en-GB",
    }),
  );
  return publicMetadata({
    title: page.title,
    description: page.description,
    ...pageAlternates("signals"),
    locale: "en-GB",
    indexable: !page.noIndex,
  });
}

export default async function SignalsPage() {
  const [content, signals] = await Promise.all([
    getPublicContent({
      documentType: "page",
      documentId: "signals",
      locale: "en-GB",
    }),
    getPublicSignals("en-GB"),
  ]);
  return (
    <EditorialPage result={content} path="/signals" locale="en-GB">
      {signals.status === "available" ? (
        <SignalBoard signals={signals} locale="en-GB" />
      ) : (
        <p className="register-state">
          The published Signal Board is temporarily unavailable.
        </p>
      )}
    </EditorialPage>
  );
}
