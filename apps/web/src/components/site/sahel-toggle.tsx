"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { SupportedLocale } from "../../lib/i18n/locale";
import { analyticsRoutes } from "../../lib/analytics-catalog";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import {
  isConstrainedConnection,
  sahelCookieName,
  sahelDismissedName,
  sahelStorageName,
} from "../../lib/sahel/mode";

export function SahelToggle({
  active,
  autoDismissed = false,
  locale,
  pathname,
}: Readonly<{
  active: boolean;
  autoDismissed?: boolean;
  locale: SupportedLocale;
  pathname: string;
}>) {
  const french = locale === "fr-FR";
  const destination = `/api/sahel?enabled=${active ? "0" : "1"}&return=${encodeURIComponent(pathname)}`;

  useEffect(() => {
    window.localStorage.setItem(sahelStorageName, active ? "1" : "0");
    const explicitlyDismissed =
      autoDismissed ||
      window.localStorage.getItem(sahelDismissedName) === "1" ||
      document.cookie
        .split(";")
        .some((cookie) => cookie.trim() === `${sahelCookieName}=dismissed`);
    if (
      !active &&
      !explicitlyDismissed &&
      isConstrainedConnection(
        (navigator as Navigator & { connection?: unknown }).connection,
      )
    ) {
      window.location.replace(
        `/api/sahel?enabled=1&return=${encodeURIComponent(pathname)}`,
      );
    }
  }, [active, autoDismissed, pathname]);

  return (
    <div className="sahel-control">
      <Link
        href={destination}
        prefetch={false}
        aria-pressed={active}
        role="button"
        onClick={() => {
          window.localStorage.setItem(sahelStorageName, active ? "0" : "1");
          if (active) window.localStorage.setItem(sahelDismissedName, "1");
          else {
            window.localStorage.removeItem(sahelDismissedName);
            if (analyticsRoutes.includes(pathname))
              void trackAnalyticsEvent({
                name: "sahel_mode_enabled",
                route: pathname,
                locale,
                mode: "sahel",
              });
          }
        }}
      >
        {active
          ? french
            ? "Quitter le mode Sahel"
            : "Exit Sahel mode"
          : french
            ? "Mode Sahel"
            : "Sahel mode"}
      </Link>
      <span>
        {french
          ? "Conçu pour fonctionner avec une connexion sahélienne."
          : "Built to work on a Sahel connection."}
      </span>
    </div>
  );
}
