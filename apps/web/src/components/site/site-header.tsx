import Link from "next/link";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import { ThemeToggle } from "./theme-toggle";
import { LiteToggle } from "./lite-toggle";
import { AmanorMark } from "./amanor-mark";
import type { Theme, ThemePreference } from "../../lib/theme/night-economy";
import { ActiveNavigationLink } from "./active-navigation-link";
import { navIcons, type NavIconKey } from "./nav-icons";

const primaryNavigation = [
  {
    href: "/record",
    icon: "record",
    label: { "en-GB": "The Record", "fr-FR": "Le parcours" },
  },
  {
    href: "/speaking",
    icon: "speaking",
    label: { "en-GB": "Speaking", "fr-FR": "Interventions" },
  },
  {
    href: "/signals",
    icon: "signals",
    label: { "en-GB": "Signals", "fr-FR": "Signaux" },
  },
  {
    href: "/press",
    icon: "press",
    label: { "en-GB": "Press", "fr-FR": "Presse" },
  },
  {
    href: "/contact",
    icon: "contact",
    label: { "en-GB": "Contact", "fr-FR": "Contact" },
  },
] as const satisfies readonly {
  href: string;
  icon: NavIconKey;
  label: Record<SupportedLocale, string>;
}[];

const drawerNavigation = [
  {
    href: "/",
    icon: "home",
    label: { "en-GB": "Home", "fr-FR": "Accueil" },
  },
  ...primaryNavigation,
] as const satisfies readonly {
  href: string;
  icon: NavIconKey;
  label: Record<SupportedLocale, string>;
}[];

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
  const homePath = localizePath("/", locale);
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
                <a
                  href={`/api/lite?enabled=0&return=${encodeURIComponent(pathname)}`}
                  aria-pressed="true"
                  role="button"
                >
                  {isFrench ? "Quitter le mode Lite" : "Exit Lite mode"}
                </a>
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
                <a
                  className="utility-action"
                  href={`/api/theme?theme=${theme === "day" ? "night" : "day"}&return=${encodeURIComponent(pathname)}`}
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
                </a>
                {themePreference !== "auto" ? (
                  <a
                    className="theme-reset"
                    href={`/api/theme?theme=auto&return=${encodeURIComponent(pathname)}`}
                  >
                    {isFrench ? "Heure d’Accra" : "Accra hours"}
                  </a>
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
        <Link
          className="wordmark"
          href={homePath}
          aria-label="Project AMANOR, home"
        >
          {lite ? null : <AmanorMark className="wordmark__mark" />}
          <span className="wordmark__lockup">
            <span className="wordmark__eyebrow">
              {isFrench ? "Le dossier indépendant" : "The independent record"}
            </span>
            <span className="wordmark__text">Project AMANOR</span>
          </span>
        </Link>
        {lite ? null : (
          <>
            <input
              type="checkbox"
              id="amanor-nav-toggle"
              className="nav-toggle-input"
              aria-label={isFrench ? "Menu de navigation" : "Navigation menu"}
            />
            <label
              className="nav-toggle"
              htmlFor="amanor-nav-toggle"
              aria-hidden="true"
            >
              <span className="nav-toggle__bars" />
            </label>
            <div
              className="nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={isFrench ? "Menu de navigation" : "Navigation menu"}
            >
              <div className="nav-drawer__head">
                <span className="nav-drawer__brand">
                  <AmanorMark className="nav-drawer__mark" />
                  <span>Project AMANOR</span>
                </span>
                <label
                  className="nav-drawer__close"
                  htmlFor="amanor-nav-toggle"
                  aria-label={isFrench ? "Fermer le menu" : "Close menu"}
                >
                  {navIcons.close}
                </label>
              </div>
              <nav
                className="nav-drawer__grid"
                aria-label={isFrench ? "Navigation principale" : "Primary"}
              >
                {drawerNavigation.map((item, index) => (
                  <ActiveNavigationLink
                    href={localizePath(item.href, locale)}
                    initialPathname={pathname}
                    drawerToggleId="amanor-nav-toggle"
                    key={item.href}
                  >
                    <span className="nav-cell__index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="nav-cell__icon">
                      {navIcons[item.icon]}
                    </span>
                    <span className="nav-cell__label">
                      {item.label[locale]}
                    </span>
                  </ActiveNavigationLink>
                ))}
              </nav>
              <div
                className="nav-drawer__utilities"
                aria-label={isFrench ? "Outils du site" : "Site utilities"}
              >
                <p>{isFrench ? "Outils" : "Utilities"}</p>
                <div className="nav-drawer__utility-row">
                  <div
                    className="nav-drawer__locale-links"
                    aria-label={
                      isFrench ? "Choix de la langue" : "Language selection"
                    }
                  >
                    <a
                      href={`/locale/en-GB?returnTo=${encodeURIComponent(pathname)}`}
                      hrefLang="en-GB"
                      aria-current={isFrench ? undefined : "page"}
                    >
                      English
                    </a>
                    <a
                      href={`/locale/fr-FR?returnTo=${encodeURIComponent(pathname)}`}
                      hrefLang="fr-FR"
                      aria-current={isFrench ? "page" : undefined}
                    >
                      Français
                    </a>
                  </div>
                  <ActiveNavigationLink
                    href={localizePath("/search", locale)}
                    initialPathname={pathname}
                    drawerToggleId="amanor-nav-toggle"
                  >
                    {isFrench ? "Recherche" : "Search"}
                  </ActiveNavigationLink>
                  <LiteToggle
                    active={false}
                    autoDismissed={liteAutoDismissed}
                    locale={locale}
                    pathname={pathname}
                  />
                  <ThemeToggle
                    locale={locale}
                    pathname={pathname}
                    theme={theme}
                    preference={themePreference}
                  />
                </div>
              </div>
              {!isSelah ? (
                <ActiveNavigationLink
                  href={localizePath("/speaking/request", locale)}
                  initialPathname={pathname}
                  drawerToggleId="amanor-nav-toggle"
                >
                  <span className="nav-cell__index" aria-hidden="true">
                    {String(drawerNavigation.length + 1).padStart(2, "0")}
                  </span>
                  <span className="nav-cell__icon">{navIcons.engagement}</span>
                  <span className="nav-cell__label">
                    {isFrench
                      ? "Proposer une intervention"
                      : "Request an engagement"}
                  </span>
                </ActiveNavigationLink>
              ) : null}
            </div>
          </>
        )}
        <nav className="primary-navigation" aria-label="Primary navigation">
          {primaryNavigation.map((item) => {
            const href = localizePath(item.href, locale);
            return (
              <ActiveNavigationLink
                href={href}
                initialPathname={pathname}
                drawerToggleId="amanor-nav-toggle"
                key={item.href}
              >
                {item.label[locale]}
              </ActiveNavigationLink>
            );
          })}
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
