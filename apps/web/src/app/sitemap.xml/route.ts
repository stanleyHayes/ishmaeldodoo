import { sitemapIndex } from "../../lib/discoverability/sitemap";
import { webEnvironment } from "../../lib/env";
export function GET(): Response {
  return webEnvironment.PUBLIC_INDEXING_ENABLED === "true"
    ? new Response(sitemapIndex(), {
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public, s-maxage=3600",
        },
      })
    : new Response("Not found", { status: 404 });
}
