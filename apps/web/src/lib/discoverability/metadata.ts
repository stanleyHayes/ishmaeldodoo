import type { Metadata } from "next";
import type { SupportedLocale } from "../i18n/locale";

type DiscoverabilityInput = Readonly<{
  title?: string | undefined;
  description?: string | undefined;
  canonical: string;
  languages: Readonly<Record<string, string>>;
  locale: SupportedLocale;
  indexable: boolean;
  indexingEnabled?: boolean | undefined;
}>;

const socialImage = "/opengraph-image";

export function publicMetadata({
  title,
  description,
  canonical,
  languages,
  locale,
  indexable,
  indexingEnabled = process.env.PUBLIC_INDEXING_ENABLED === "true",
}: DiscoverabilityInput): Metadata {
  const resolvedTitle = title?.trim() || "Project AMANOR";
  const resolvedDescription =
    description?.trim() ||
    (locale === "fr-FR"
      ? "Une plateforme d’autorité indépendante fondée sur un dossier public sourcé."
      : "An independent authority platform built around a sourced public record.");

  const discoverable = indexable && indexingEnabled;
  return {
    title: resolvedTitle,
    description: resolvedDescription,
    alternates: {
      canonical,
      languages,
      ...(discoverable
        ? {
            types: {
              "application/atom+xml":
                locale === "fr-FR" ? "/fr/feed.xml" : "/feed.xml",
            },
          }
        : {}),
    },
    robots: { index: discoverable, follow: discoverable },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "Project AMANOR",
      locale: locale === "fr-FR" ? "fr_FR" : "en_GB",
      alternateLocale: locale === "fr-FR" ? ["en_GB"] : ["fr_FR"],
      title: resolvedTitle,
      description: resolvedDescription,
      images: [{ url: socialImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description: resolvedDescription,
      images: [socialImage],
    },
  };
}
