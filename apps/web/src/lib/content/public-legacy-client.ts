import { publicLegacySchema, type PublicLegacy } from "@amanor/contracts";
import {
  serviceAuthHeaders,
  type ServiceAuthConfiguration,
} from "../service-auth";
import { typographyForLocale } from "../i18n/french-typography";

export type PublicLegacyResult =
  ({ status: "available" } & PublicLegacy) | { status: "unavailable" };

export function createPublicLegacyClient(
  configuration: Readonly<{
    baseUrl: string;
    timeoutMilliseconds?: number;
    serviceAuth?: ServiceAuthConfiguration;
  }>,
) {
  return async (locale: "en-GB" | "fr-FR"): Promise<PublicLegacyResult> => {
    const url = new URL(
      `${configuration.baseUrl.replace(/\/$/u, "")}/public/legacy`,
    );
    url.searchParams.set("locale", locale);
    try {
      const response = await fetch(url, {
        redirect: "error",
        headers: {
          Accept: "application/json",
          ...serviceAuthHeaders(url, configuration.serviceAuth),
        },
        signal: AbortSignal.timeout(configuration.timeoutMilliseconds ?? 3_000),
        next: {
          revalidate: 300,
          tags: ["content:scholar", `content:scholar:${locale}`],
        },
      });
      if (!response.ok) return { status: "unavailable" };
      const parsed = publicLegacySchema.safeParse(await response.json());
      return parsed.success
        ? { status: "available", ...typographyForLocale(parsed.data, locale) }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  };
}
