import {
  publicArchiveSchema,
  type ApiOperations,
  type PublicArchive,
} from "@amanor/contracts";
import {
  serviceAuthHeaders,
  type ServiceAuthConfiguration,
} from "../service-auth";
import { typographyForLocale } from "../i18n/french-typography";

export type PublicArchiveResult =
  ({ status: "available" } & PublicArchive) | { status: "unavailable" };
type Relative<P extends string> = P extends `/v1${infer R}` ? R : never;
const path: Relative<ApiOperations["PublicArchiveController_list"]["path"]> =
  "/public/archive";

export function createPublicArchiveClient(
  configuration: Readonly<{
    baseUrl: string;
    timeoutMilliseconds?: number;
    serviceAuth?: ServiceAuthConfiguration;
  }>,
) {
  return async (
    locale: "en-GB" | "fr-FR",
    filters: Readonly<{ query?: string; type?: string }> = {},
  ): Promise<PublicArchiveResult> => {
    const url = new URL(`${configuration.baseUrl.replace(/\/$/u, "")}${path}`);
    url.searchParams.set("locale", locale);
    if (filters.query) url.searchParams.set("q", filters.query);
    if (filters.type) url.searchParams.set("type", filters.type);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...serviceAuthHeaders(url, configuration.serviceAuth),
        },
        signal: AbortSignal.timeout(configuration.timeoutMilliseconds ?? 3_000),
        next: {
          revalidate: 300,
          tags: ["content:archiveItem", `content:archiveItem:${locale}`],
        },
      });
      if (!response.ok) return { status: "unavailable" };
      const parsed = publicArchiveSchema.safeParse(await response.json());
      return parsed.success
        ? { status: "available", ...typographyForLocale(parsed.data, locale) }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  };
}
