import { localeSitemap } from "../../lib/discoverability/sitemap";
import { webEnvironment } from "../../lib/env";
export async function GET(): Promise<Response> {
  return webEnvironment.PUBLIC_INDEXING_ENABLED === "true"
    ? new Response(await localeSitemap("en-GB"), {
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public, s-maxage=3600",
        },
      })
    : new Response("Not found", { status: 404 });
}
