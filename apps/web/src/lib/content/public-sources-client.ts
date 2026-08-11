import {
  publicSourcePageSchema,
  type ApiOperations,
  type PublicSourcePage,
} from "@amanor/contracts";
import {
  serviceAuthHeaders,
  type ServiceAuthConfiguration,
} from "../service-auth";
import { typographyForLocale } from "../i18n/french-typography";

export type PublicSourcesResult =
  | Readonly<{ status: "available"; page: PublicSourcePage }>
  | Readonly<{ status: "unavailable" }>;

type WithoutVersionPrefix<Path extends string> =
  Path extends `/v1${infer Relative}` ? Relative : never;
const sourcesPath: WithoutVersionPrefix<
  ApiOperations["PublicSourcesController_list"]["path"]
> = "/public/sources";

export function createPublicSourcesClient(
  configuration: Readonly<{
    baseUrl: string;
    timeoutMilliseconds?: number;
    serviceAuth?: ServiceAuthConfiguration;
  }>,
) {
  const baseUrl = configuration.baseUrl.replace(/\/$/u, "");
  const timeout = configuration.timeoutMilliseconds ?? 3_000;
  return async function fetchPublicSources(
    input: Readonly<{
      locale: "en-GB" | "fr-FR";
      query?: string;
      cursor?: string;
    }>,
  ): Promise<PublicSourcesResult> {
    const url = new URL(`${baseUrl}${sourcesPath}`);
    url.searchParams.set("locale", input.locale);
    url.searchParams.set("limit", "25");
    if (input.query) url.searchParams.set("q", input.query.slice(0, 100));
    if (input.cursor) url.searchParams.set("cursor", input.cursor);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...serviceAuthHeaders(url, configuration.serviceAuth),
        },
        signal: AbortSignal.timeout(timeout),
        next: { revalidate: 60, tags: ["content", "content:source"] },
      });
      if (!response.ok) return { status: "unavailable" };
      const parsed = publicSourcePageSchema.safeParse(await response.json());
      return parsed.success
        ? {
            status: "available",
            page: typographyForLocale(parsed.data, input.locale),
          }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  };
}
