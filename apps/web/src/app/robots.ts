import type { MetadataRoute } from "next";
import { webEnvironment } from "../lib/env";
export default function robots(): MetadataRoute.Robots {
  const enabled = webEnvironment.PUBLIC_INDEXING_ENABLED === "true";
  return {
    rules: {
      userAgent: "*",
      allow: enabled ? "/" : undefined,
      disallow: enabled ? ["/api/", "/locale/"] : "/",
    },
    sitemap: enabled
      ? `${webEnvironment.PUBLIC_WEB_BASE_URL.replace(/\/$/u, "")}/sitemap.xml`
      : undefined,
  };
}
