"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import type { SupportedLocale } from "../../lib/i18n/locale";

export function AtlasFilterAnalytics({
  locale,
  route,
  filtered,
  lite = false,
}: Readonly<{
  locale: SupportedLocale;
  route: string;
  filtered: boolean;
  lite?: boolean;
}>) {
  useEffect(() => {
    if (!filtered) return;
    void trackAnalyticsEvent({
      name: "atlas_filter_applied",
      route,
      locale,
      ...(lite ? { mode: "sahel" as const } : {}),
    });
  }, [filtered, lite, locale, route]);

  return null;
}
