"use client";

import Link from "next/link";
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
  const toggleHref = `/api/theme?theme=${next}&return=${encodeURIComponent(pathname)}`;
  return (
    <span className="theme-control">
      <Link
        className="utility-action"
        href={toggleHref}
        prefetch={false}
        role="button"
        aria-pressed={theme === "night"}
        onClick={() => window.localStorage.setItem(themeStorageName, next)}
      >
        {theme === "night"
          ? french
            ? "Mode jour"
            : "Day mode"
          : french
            ? "Économie nocturne"
            : "Night economy"}
      </Link>
      {preference !== "auto" ? (
        <Link
          className="theme-reset"
          href={`/api/theme?theme=auto&return=${encodeURIComponent(pathname)}`}
          prefetch={false}
          onClick={() => window.localStorage.removeItem(themeStorageName)}
        >
          {french ? "Heure d’Accra" : "Accra hours"}
        </Link>
      ) : null}
    </span>
  );
}
