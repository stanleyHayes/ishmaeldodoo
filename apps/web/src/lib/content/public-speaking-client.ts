import {
  publicSpeakingSchema,
  type ApiOperations,
  type PublicSpeaking,
} from "@amanor/contracts";
import {
  serviceAuthHeaders,
  type ServiceAuthConfiguration,
} from "../service-auth";
import { typographyForLocale } from "../i18n/french-typography";

export type PublicSpeakingResult =
  ({ status: "available" } & PublicSpeaking) | { status: "unavailable" };
type Relative<P extends string> = P extends `/v1${infer R}` ? R : never;
const path: Relative<ApiOperations["PublicSpeakingController_list"]["path"]> =
  "/public/speaking";

export function createPublicSpeakingClient(
  configuration: Readonly<{
    baseUrl: string;
    timeoutMilliseconds?: number;
    serviceAuth?: ServiceAuthConfiguration;
  }>,
) {
  return async (locale: "en-GB" | "fr-FR"): Promise<PublicSpeakingResult> => {
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
          revalidate: 300,
          tags: ["content:speakingTheme", `content:speakingTheme:${locale}`],
        },
      });
      if (!response.ok) return { status: "unavailable" };
      const parsed = publicSpeakingSchema.safeParse(await response.json());
      return parsed.success
        ? { status: "available", ...typographyForLocale(parsed.data, locale) }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  };
}
