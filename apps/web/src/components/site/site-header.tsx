import Link from "next/link";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import { ThemeToggle } from "./theme-toggle";
import { LiteToggle } from "./lite-toggle";
import type { Theme, ThemePreference } from "../../lib/theme/night-economy";

const primaryNavigation = [
  { href: "/record", label: { "en-GB": "The Record", "fr-FR": "Le parcours" } },
  {
    href: "/speaking",
    label: { "en-GB": "Speaking", "fr-FR": "Interventions" },
  },
  { href: "/signals", label: { "en-GB": "Signals", "fr-FR": "Signaux" } },
  { href: "/press", label: { "en-GB": "Press", "fr-FR": "Presse" } },
  { href: "/contact", label: { "en-GB": "Contact", "fr-FR": "Contact" } },
] as const;

export function SiteHeader({
  locale = "en-GB",
  pathname = "/",
  lite = false,
  liteAutoDismissed = false,
  theme = "day",
  themePreference = "auto",
}: Readonly<{
  locale?: SupportedLocale;
  pathname?: string;
  lite?: boolean;
  liteAutoDismissed?: boolean;
  theme?: Theme;
  themePreference?: ThemePreference;
}>) {
  const isFrench = locale === "fr-FR";
  const isSelah = pathname === "/selah" || pathname === "/fr/selah";
  return (
    <header className="site-header">
      <div className="utility-bar" aria-label="Site utilities">
        <div className="site-frame utility-bar__inner">
          <div className="locale-links" aria-label="Language selection">
            <a
              href={`/locale/en-GB?returnTo=${encodeURIComponent(pathname)}`}
              hrefLang="en-GB"
              aria-current={isFrench ? undefined : "page"}
            >
              EN
            </a>
            <a
              href={`/locale/fr-FR?returnTo=${encodeURIComponent(pathname)}`}
              hrefLang="fr-FR"
              aria-current={isFrench ? "page" : undefined}
            >
              FR
            </a>
          </div>
          <div className="utility-actions">
            <Link href={localizePath("/search", locale)}>
              {isFrench ? "Recherche" : "Search"}
            </Link>
            {lite ? (
              <div className="lite-control">
                <Link
                  href={`/api/lite?enabled=0&return=${encodeURIComponent(pathname)}`}
                  prefetch={false}
                  aria-pressed="true"
                  role="button"
                >
                  {isFrench ? "Quitter le mode Lite" : "Exit Lite mode"}
                </Link>
                <span>
                  {isFrench
                    ? "Conçu pour fonctionner avec une connexion sahélienne."
                    : "Built to work on a Lite connection."}
                </span>
              </div>
            ) : (
              <LiteToggle
                active={false}
                autoDismissed={liteAutoDismissed}
                locale={locale}
                pathname={pathname}
              />
            )}
            {lite ? (
              <span className="theme-control">
                <Link
                  className="utility-action"
                  href={`/api/theme?theme=${theme === "day" ? "night" : "day"}&return=${encodeURIComponent(pathname)}`}
                  prefetch={false}
                  role="button"
                  aria-pressed={theme === "night"}
                >
                  {theme === "night"
                    ? isFrench
                      ? "Mode jour"
                      : "Day mode"
                    : isFrench
                      ? "Économie nocturne"
                      : "Night economy"}
                </Link>
                {themePreference !== "auto" ? (
                  <Link
                    className="theme-reset"
                    href={`/api/theme?theme=auto&return=${encodeURIComponent(pathname)}`}
                    prefetch={false}
                  >
                    {isFrench ? "Heure d’Accra" : "Accra hours"}
                  </Link>
                ) : null}
              </span>
            ) : (
              <ThemeToggle
                locale={locale}
                pathname={pathname}
                theme={theme}
                preference={themePreference}
              />
            )}
          </div>
        </div>
      </div>
      <div className="site-frame primary-bar">
        <Link className="wordmark" href="/" aria-label="Project AMANOR, home">
          Project AMANOR
        </Link>
        <nav className="primary-navigation" aria-label="Primary navigation">
          {primaryNavigation.map((item) => (
            <Link href={localizePath(item.href, locale)} key={item.href}>
              {item.label[locale]}
            </Link>
          ))}
        </nav>
        {!isSelah ? (
          <Link
            className="engagement-link"
            href={localizePath("/speaking/request", locale)}
          >
            {isFrench ? "Proposer une intervention" : "Request an engagement"}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
