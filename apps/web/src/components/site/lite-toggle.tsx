"use client";

import { useEffect } from "react";
import type { SupportedLocale } from "../../lib/i18n/locale";
import { analyticsRoutes } from "../../lib/analytics-catalog";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import {
  isConstrainedConnection,
  liteCookieName,
  liteDismissedName,
  liteStorageName,
} from "../../lib/lite/mode";

export function LiteToggle({
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
  const destination = `/api/lite?enabled=${active ? "0" : "1"}&return=${encodeURIComponent(pathname)}`;

  useEffect(() => {
    window.localStorage.setItem(liteStorageName, active ? "1" : "0");
    const explicitlyDismissed =
      autoDismissed ||
      window.localStorage.getItem(liteDismissedName) === "1" ||
      document.cookie
        .split(";")
        .some((cookie) => cookie.trim() === `${liteCookieName}=dismissed`);
    if (
      !active &&
      !explicitlyDismissed &&
      isConstrainedConnection(
        (navigator as Navigator & { connection?: unknown }).connection,
      )
    ) {
      window.location.replace(
        `/api/lite?enabled=1&return=${encodeURIComponent(pathname)}`,
      );
    }
  }, [active, autoDismissed, pathname]);

  return (
    <div className="lite-control">
      <a
        href={destination}
        aria-pressed={active}
        role="button"
        onClick={() => {
          window.localStorage.setItem(liteStorageName, active ? "0" : "1");
          if (active) window.localStorage.setItem(liteDismissedName, "1");
          else {
            window.localStorage.removeItem(liteDismissedName);
            if (analyticsRoutes.includes(pathname))
              void trackAnalyticsEvent({
                name: "lite_mode_enabled",
                route: pathname,
                locale,
                mode: "lite",
              });
          }
        }}
      >
        {active
          ? french
            ? "Quitter le mode Lite"
            : "Exit Lite mode"
          : french
            ? "Mode Lite"
            : "Lite mode"}
      </a>
      <span>
        {french
          ? "Conçu pour fonctionner avec une connexion sahélienne."
          : "Built to work on a Lite connection."}
      </span>
    </div>
  );
}
