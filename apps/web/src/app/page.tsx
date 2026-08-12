import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AdaptiveHome } from "../components/content/adaptive-home";
import { identityPayload } from "../lib/content/identity-payload";
import {
  audienceCookieName,
  audienceKey,
} from "../lib/audience/adaptive-dossier";
import { getPublicAtlas } from "../lib/content/get-public-atlas";
import { getPublicContent } from "../lib/content/get-public-content";
import type { SupportedLocale } from "../lib/i18n/locale";
import { publicMetadata } from "../lib/discoverability/metadata";
import { getPublicSignal } from "../lib/content/get-public-signal";
import { isLiteValue, liteCookieName } from "../lib/lite/mode";

export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicContent({
    documentType: "identity",
    documentId: "principal",
    locale: "en-GB",
  });
  const identity =
    result.status === "available"
      ? identityPayload(result.content.payload)
      : null;
  return publicMetadata({
    title: identity?.displayName,
    description: identity?.bio40,
    canonical: "/",
    languages: { "en-GB": "/", "fr-FR": "/fr", "x-default": "/" },
    locale: "en-GB",
    indexable: Boolean(identity),
  });
}

export default async function FoundationPage({
  locale = "en-GB",
  searchParams = Promise.resolve({}),
}: Readonly<{
  locale?: SupportedLocale;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const [atlas, identityResult, signalResult, parameters, cookieStore] =
    await Promise.all([
      getPublicAtlas(locale),
      getPublicContent({
        documentType: "identity",
        documentId: "principal",
        locale,
      }),
      getPublicSignal(locale),
      searchParams,
      cookies(),
    ]);
  const audience =
    audienceKey(parameters.door) ??
    audienceKey(cookieStore.get(audienceCookieName)?.value);
  const explicitLite =
    isLiteValue(parameters.lite) || isLiteValue(parameters.mode);
  const storedLite = cookieStore.get(liteCookieName)?.value;
  const lite =
    explicitLite || (storedLite !== "dismissed" && isLiteValue(storedLite));
  const identity =
    identityResult.status === "available"
      ? identityPayload(identityResult.content.payload)
      : null;
  return (
    <AdaptiveHome
      locale={locale}
      audience={audience}
      atlas={atlas.status === "available" ? atlas.items : []}
      identity={identity}
      signal={signalResult.status === "available" ? signalResult.signal : null}
      lite={lite}
    />
  );
}
