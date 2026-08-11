import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import "@fontsource-variable/inter-tight/wght.css";
import "@fontsource-variable/newsreader/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import { SiteFooter } from "../components/site/site-footer";
import { SiteHeader } from "../components/site/site-header";
import { SkipLink } from "../components/site/skip-link";
import { webEnvironment } from "../lib/env";
import { localeFromPathname } from "../lib/i18n/locale";
import { getPublicContent } from "../lib/content/get-public-content";
import { PersonStructuredData } from "../components/content/person-structured-data";
import type { Theme, ThemePreference } from "../lib/theme/night-economy";
import "./tokens.css";
import "./globals.css";
import { AnalyticsConsentControl } from "../components/site/analytics-consent";
import {
  analyticsConsentCookie,
  type AnalyticsConsent,
} from "../lib/analytics-catalog";
import { sahelCookieName } from "../lib/sahel/mode";

export const metadata: Metadata = {
  metadataBase: new URL(webEnvironment.PUBLIC_WEB_BASE_URL),
  title: "Project AMANOR",
  description:
    "An independent authority platform built around a sourced public record.",
  robots: {
    index: webEnvironment.PUBLIC_INDEXING_ENABLED === "true",
    follow: webEnvironment.PUBLIC_INDEXING_ENABLED === "true",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const pathname = requestHeaders.get("x-amanor-pathname") ?? "/";
  const privateDecision =
    pathname === "/protocol-decision" || pathname === "/fr/protocol-decision";
  const locale = localeFromPathname(pathname);
  const sahel = requestHeaders.get("x-amanor-sahel") === "1";
  const theme = (
    requestHeaders.get("x-amanor-theme") === "night" ? "night" : "day"
  ) satisfies Theme;
  const themePreference = (requestHeaders.get("x-amanor-theme-preference") ??
    "auto") as ThemePreference;
  const identity = privateDecision
    ? null
    : await getPublicContent({
        documentType: "identity",
        documentId: "canonical",
        locale,
      });
  const storedAnalytics = cookieStore.get(analyticsConsentCookie)?.value;
  const sahelAutoDismissed =
    cookieStore.get(sahelCookieName)?.value === "dismissed";
  const analyticsConsent = (
    storedAnalytics === "granted" || storedAnalytics === "denied"
      ? storedAnalytics
      : null
  ) satisfies AnalyticsConsent;
  return (
    <html
      lang={locale}
      data-mode={sahel ? "sahel" : undefined}
      data-theme={theme === "night" ? "night" : undefined}
      data-scroll-behavior="smooth"
    >
      <body>
        {!privateDecision ? (
          <>
            {identity ? (
              <PersonStructuredData
                result={identity}
                baseUrl={webEnvironment.PUBLIC_WEB_BASE_URL}
              />
            ) : null}
            <SkipLink
              label={
                locale === "fr-FR" ? "Aller au contenu" : "Skip to content"
              }
            />
            <SiteHeader
              locale={locale}
              pathname={pathname}
              sahel={sahel}
              sahelAutoDismissed={sahelAutoDismissed}
              theme={theme}
              themePreference={themePreference}
            />
          </>
        ) : null}
        {children}
        {privateDecision ? null : sahel ? (
          <div className="analytics-preference site-frame">
            <span>
              {locale === "fr-FR"
                ? "Aucune mesure analytique en mode Sahel"
                : "No analytics in Sahel mode"}
            </span>
          </div>
        ) : (
          <AnalyticsConsentControl
            locale={locale}
            initialConsent={analyticsConsent}
          />
        )}
        {!privateDecision ? <SiteFooter locale={locale} /> : null}
      </body>
    </html>
  );
}
