import { getPublicArchive } from "../../lib/content/get-public-archive";
import { archiveAtomFeed } from "../../lib/discoverability/atom";
import { webEnvironment } from "../../lib/env";

export async function GET() {
  if (webEnvironment.PUBLIC_INDEXING_ENABLED !== "true")
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const archive = await getPublicArchive("en-GB");
  if (archive.status !== "available")
    return new Response("Archive feed is temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  return new Response(
    archiveAtomFeed({
      archive,
      baseUrl: webEnvironment.PUBLIC_WEB_BASE_URL,
      locale: "en-GB",
    }),
    {
      headers: {
        "Content-Type": "application/atom+xml; charset=utf-8",
        "Cache-Control":
          "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
