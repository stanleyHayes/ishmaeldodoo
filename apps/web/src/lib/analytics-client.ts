import type { AnalyticsEvent } from "./analytics-catalog";

export async function trackAnalyticsEvent(
  event: AnalyticsEvent,
): Promise<void> {
  await fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify(event),
  }).catch(() => undefined);
}
