import {
  publicAtlasSchema,
  type PublicAtlas,
  type ApiOperations,
} from "@amanor/contracts";
import {
  serviceAuthHeaders,
  type ServiceAuthConfiguration,
} from "../service-auth";
import { typographyForLocale } from "../i18n/french-typography";
export type PublicAtlasResult =
  ({ status: "available" } & PublicAtlas) | { status: "unavailable" };
type Relative<P extends string> = P extends `/v1${infer R}` ? R : never;
const path: Relative<ApiOperations["PublicAtlasController_list"]["path"]> =
  "/public/atlas";
export function createPublicAtlasClient(
  configuration: Readonly<{
    baseUrl: string;
    timeoutMilliseconds?: number;
    serviceAuth?: ServiceAuthConfiguration;
  }>,
) {
  return async (locale: "en-GB" | "fr-FR"): Promise<PublicAtlasResult> => {
    const url = new URL(`${configuration.baseUrl.replace(/\/$/u, "")}${path}`);
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
          tags: ["content:atlasNode", `content:atlasNode:${locale}`],
        },
      });
      if (!response.ok) return { status: "unavailable" };
      const parsed = publicAtlasSchema.safeParse(await response.json());
      return parsed.success
        ? { status: "available", ...typographyForLocale(parsed.data, locale) }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  };
}
