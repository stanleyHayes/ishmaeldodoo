import { publicSignalsSchema, type PublicSignals } from "@amanor/contracts";
import {
  serviceAuthHeaders,
  type ServiceAuthConfiguration,
} from "../service-auth";
import { typographyForLocale } from "../i18n/french-typography";

export type PublicSignalsResult =
  ({ status: "available" } & PublicSignals) | { status: "unavailable" };

export function createPublicSignalsClient(
  configuration: Readonly<{
    baseUrl: string;
    timeoutMilliseconds?: number;
    serviceAuth?: ServiceAuthConfiguration;
  }>,
) {
  return async (locale: "en-GB" | "fr-FR"): Promise<PublicSignalsResult> => {
    const url = new URL(
      `${configuration.baseUrl.replace(/\/$/u, "")}/public/signals`,
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
          revalidate: 60,
          tags: ["content:signal", `content:signal:${locale}`],
        },
      });
      if (!response.ok) return { status: "unavailable" };
      const parsed = publicSignalsSchema.safeParse(await response.json());
      return parsed.success
        ? { status: "available", ...typographyForLocale(parsed.data, locale) }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  };
}
