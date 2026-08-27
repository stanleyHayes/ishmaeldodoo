"use client";

import type { SupportedLocale } from "../../lib/i18n/locale";
import {
  themeStorageName,
  type Theme,
  type ThemePreference,
} from "../../lib/theme/night-economy";

export function ThemeToggle({
  locale = "en-GB",
  pathname = "/",
  theme = "day",
  preference = "auto",
}: Readonly<{
  locale?: SupportedLocale;
  pathname?: string;
  theme?: Theme;
  preference?: ThemePreference;
}>) {
  const french = locale === "fr-FR";
  const next: Theme = theme === "day" ? "night" : "day";
  // The control is icon-only, so its accessible name must announce the action
  // it performs — the theme it switches to — not a generic "toggle" label.
  const label =
    theme === "night"
      ? french
        ? "Mode jour"
        : "Day mode"
      : french
        ? "Économie nocturne"
        : "Night economy";
  const toggleHref = `/api/theme?theme=${next}&return=${encodeURIComponent(pathname)}`;
  return (
    <span className="theme-control">
      <a
        className="utility-action theme-toggle"
        href={toggleHref}
        role="button"
        aria-pressed={theme === "night"}
        aria-label={label}
        title={label}
        onClick={() => {
          window.localStorage.setItem(themeStorageName, next);
          // Apply the theme to the document immediately so the switch — and the
          // icon, which is CSS-driven by data-theme — flips instantly; the
          // navigation below still persists the cookie.
          const root = document.documentElement;
          if (next === "night") root.setAttribute("data-theme", "night");
          else root.removeAttribute("data-theme");
        }}
      >
        <svg
          className="theme-toggle__icon theme-toggle__sun"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="4.1"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12 2.5v2.2M12 19.3v2.2M4.2 12H2M22 12h-2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <svg
          className="theme-toggle__icon theme-toggle__moon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </a>
      {preference !== "auto" ? (
        <a
          className="theme-reset"
          href={`/api/theme?theme=auto&return=${encodeURIComponent(pathname)}`}
          onClick={() => window.localStorage.removeItem(themeStorageName)}
        >
          {french ? "Heure d’Accra" : "Accra hours"}
        </a>
      ) : null}
    </span>
  );
}
