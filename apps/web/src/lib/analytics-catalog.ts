export const analyticsConsentCookie = "amanor-analytics";
const baseRoutes = [
  "/",
  "/record",
  "/record/atlas",
  "/record/atlas/table",
  "/record/sources",
  "/speaking",
  "/speaking/request",
  "/signals",
  "/press",
  "/press/contact",
  "/doctrine",
  "/archive",
  "/legacy",
  "/office-hours",
  "/selah",
  "/contact",
  "/legal/privacy",
  "/legal/terms",
  "/legal/disclosure",
] as const;
export const analyticsRoutes = [
  ...baseRoutes,
  ...baseRoutes.map((route) => (route === "/" ? "/fr" : `/fr${route}`)),
] as [string, ...string[]];
export const analyticsEventNames = [
  "pageview",
  "audience_selected",
  "lite_mode_enabled",
  "atlas_filter_applied",
  "atlas_record_opened",
  "press_kit_requested",
  "protocol_desk_started",
  "protocol_desk_completed",
] as const;
export type AnalyticsConsent = "granted" | "denied" | null;
export type AnalyticsEvent = Readonly<{
  name: (typeof analyticsEventNames)[number];
  route: string;
  locale: "en-GB" | "fr-FR";
  audience?: "government" | "investor" | "media" | "youth" | "philanthropy";
  mode?: "standard" | "lite";
}>;
