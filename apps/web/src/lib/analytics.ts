import { z } from "zod";
import {
  analyticsConsentCookie,
  analyticsEventNames,
  analyticsRoutes,
} from "./analytics-catalog";
export { analyticsConsentCookie } from "./analytics-catalog";
export type { AnalyticsConsent, AnalyticsEvent } from "./analytics-catalog";

export const analyticsEventSchema = z
  .object({
    name: z.enum(analyticsEventNames),
    route: z.enum(analyticsRoutes),
    locale: z.enum(["en-GB", "fr-FR"]),
    audience: z
      .enum(["government", "investor", "media", "youth", "philanthropy"])
      .optional(),
    mode: z.enum(["standard", "lite"]).optional(),
  })
  .strict();

export function hasAnalyticsConsent(cookieHeader: string | null): boolean {
  return (cookieHeader ?? "")
    .split(";")
    .some((cookie) => cookie.trim() === `${analyticsConsentCookie}=granted`);
}
