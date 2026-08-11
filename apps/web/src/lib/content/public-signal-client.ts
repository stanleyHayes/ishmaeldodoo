import {
  publicSignalSchema,
  type ApiOperations,
  type PublicSignal,
} from "@amanor/contracts";
import {
  serviceAuthHeaders,
  type ServiceAuthConfiguration,
} from "../service-auth";
import { typographyForLocale } from "../i18n/french-typography";

export type PublicSignalResult =
  { status: "available"; signal: PublicSignal } | { status: "unavailable" };
type Relative<P extends string> = P extends `/v1${infer R}` ? R : never;
const path: Relative<ApiOperations["PublicSignalsController_latest"]["path"]> =
  "/public/signals/latest";

export function createPublicSignalClient(
  configuration: Readonly<{
    baseUrl: string;
    timeoutMilliseconds?: number;
    serviceAuth?: ServiceAuthConfiguration;
  }>,
) {
  return async (locale: "en-GB" | "fr-FR"): Promise<PublicSignalResult> => {
    const url = new URL(`${configuration.baseUrl.replace(/\/$/u, "")}${path}`);
    url.searchParams.set("locale", locale);
    try {
      const response = await fetch(url, {
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
      const parsed = publicSignalSchema.safeParse(await response.json());
      return parsed.success
        ? {
            status: "available",
            signal: typographyForLocale(parsed.data, locale),
          }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  };
}
