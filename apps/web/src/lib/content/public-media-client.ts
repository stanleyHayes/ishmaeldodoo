import {
  publicMediaSchema,
  type ApiOperations,
  type PublicMedia,
} from "@amanor/contracts";
import {
  serviceAuthHeaders,
  type ServiceAuthConfiguration,
} from "../service-auth";
import { typographyForLocale } from "../i18n/french-typography";

export type PublicMediaResult =
  | Readonly<{ status: "available"; asset: PublicMedia }>
  | Readonly<{ status: "not_found" | "unavailable" }>;

type WithoutVersionPrefix<Path extends string> =
  Path extends `/v1${infer Relative}` ? Relative : never;
const mediaPath: WithoutVersionPrefix<
  ApiOperations["PublicMediaController_asset"]["path"]
> = "/public/media/{assetId}";

export function createPublicMediaClient(
  configuration: Readonly<{
    baseUrl: string;
    timeoutMilliseconds?: number;
    serviceAuth?: ServiceAuthConfiguration;
  }>,
) {
  const baseUrl = configuration.baseUrl.replace(/\/$/u, "");
  const timeout = configuration.timeoutMilliseconds ?? 3_000;
  return async function fetchPublicMedia(
    assetId: string,
    locale: "en-GB" | "fr-FR",
  ): Promise<PublicMediaResult> {
    const path = mediaPath.replace("{assetId}", encodeURIComponent(assetId));
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("locale", locale);
    try {
      const response = await fetch(url, {
        redirect: "error",
        headers: {
          Accept: "application/json",
          ...serviceAuthHeaders(url, configuration.serviceAuth),
        },
        signal: AbortSignal.timeout(timeout),
        next: { revalidate: 300, tags: ["media", `media:${assetId}`] },
      });
      if (response.status === 404) return { status: "not_found" };
      if (!response.ok) return { status: "unavailable" };
      const parsed = publicMediaSchema.safeParse(await response.json());
      return parsed.success
        ? {
            status: "available",
            asset: typographyForLocale(parsed.data, locale),
          }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  };
}
