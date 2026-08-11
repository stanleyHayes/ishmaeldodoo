import {
  publicContentProjectionSchema,
  type ApiOperations,
  type PublicContentProjection,
} from "@amanor/contracts";
import {
  serviceAuthHeaders,
  type ServiceAuthConfiguration,
} from "../service-auth";
import { typographyForLocale } from "../i18n/french-typography";

export type PublicContentResult =
  | Readonly<{ status: "available"; content: PublicContentProjection }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{
      status: "unavailable";
      reason: "timeout" | "upstream" | "invalid_response";
    }>;

type NextFetchInit = RequestInit & {
  next?: { revalidate?: number; tags?: string[] };
};
type WithoutVersionPrefix<Path extends string> =
  Path extends `/v1${infer Relative}` ? Relative : never;
const publicContentPath: WithoutVersionPrefix<
  ApiOperations["PublicContentController_getPublished"]["path"]
> = "/public/content/{documentType}/{documentId}";

export function createPublicContentClient(
  configuration: Readonly<{
    baseUrl: string;
    timeoutMilliseconds?: number;
    serviceAuth?: ServiceAuthConfiguration;
  }>,
) {
  const baseUrl = configuration.baseUrl.replace(/\/$/u, "");
  const timeout = configuration.timeoutMilliseconds ?? 3_000;

  return async function fetchPublishedContent(
    input: Readonly<{
      documentType: string;
      documentId: string;
      locale: "en-GB" | "fr-FR";
    }>,
  ): Promise<PublicContentResult> {
    const path = publicContentPath
      .replace("{documentType}", encodeURIComponent(input.documentType))
      .replace("{documentId}", encodeURIComponent(input.documentId));
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("locale", input.locale);
    const init: NextFetchInit = {
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...serviceAuthHeaders(url, configuration.serviceAuth),
      },
      signal: AbortSignal.timeout(timeout),
      next: {
        revalidate: 60,
        tags: [
          "content",
          `content:${input.documentType}`,
          `content:${input.documentType}:${input.documentId}`,
          `locale:${input.locale}`,
        ],
      },
    };
    try {
      const response = await fetch(url, init);
      if (response.status === 404) return { status: "not_found" };
      if (!response.ok) return { status: "unavailable", reason: "upstream" };
      const parsed = publicContentProjectionSchema.safeParse(
        await response.json(),
      );
      return parsed.success
        ? {
            status: "available",
            content: typographyForLocale(parsed.data, input.locale),
          }
        : { status: "unavailable", reason: "invalid_response" };
    } catch (error) {
      return {
        status: "unavailable",
        reason:
          error instanceof DOMException && error.name === "TimeoutError"
            ? "timeout"
            : "upstream",
      };
    }
  };
}
