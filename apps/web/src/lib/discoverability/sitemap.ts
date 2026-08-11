import { getPublicContent } from "../content/get-public-content";
import { publicPageRoutes, localizedRoute } from "../content/public-pages";
import type { SupportedLocale } from "../i18n/locale";
import { webEnvironment } from "../env";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export async function localeSitemap(locale: SupportedLocale): Promise<string> {
  const base = webEnvironment.PUBLIC_WEB_BASE_URL.replace(/\/$/u, "");
  const entries = await Promise.all(
    Object.entries(publicPageRoutes).map(async ([path, documentId]) => {
      const documentType =
        path === "press" ? ("identity" as const) : ("page" as const);
      const resolvedId = path === "press" ? "canonical" : documentId;
      const result = await getPublicContent({
        documentType,
        documentId: resolvedId,
        locale,
      });
      if (result.status !== "available") return null;
      const payload = result.content.payload as { seo?: { noIndex?: boolean } };
      if (payload.seo?.noIndex) return null;
      return {
        url: `${base}${localizedRoute(path as keyof typeof publicPageRoutes, locale)}`,
        modified: result.content.publishedAt.toISOString(),
      };
    }),
  );
  const press = entries.find((entry) =>
    entry?.url.endsWith(locale === "fr-FR" ? "/fr/press" : "/press"),
  );
  if (press)
    entries.push({ url: `${press.url}/contact`, modified: press.modified });

  // The Room is a code-reviewed route rather than a CMS page, so it has no
  // publication of its own to derive from. It rides on P13's, exactly as the
  // press contact route rides on P07's: if Contact is unpublished or noindex,
  // The Room drops out of the sitemap with it.
  // Matched exactly, not by suffix: `/press/contact` was appended above and
  // would otherwise match, producing a `/press/contact/room` that does not exist.
  const contactUrl = `${base}${localizedRoute("contact", locale)}`;
  const contact = entries.find((entry) => entry?.url === contactUrl);
  if (contact)
    entries.push({ url: `${contact.url}/room`, modified: contact.modified });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map(
      (entry) =>
        `  <url><loc>${escapeXml(entry.url)}</loc><lastmod>${entry.modified}</lastmod></url>`,
    )
    .join("\n")}\n</urlset>\n`;
}

export function sitemapIndex(): string {
  const base = webEnvironment.PUBLIC_WEB_BASE_URL.replace(/\/$/u, "");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${escapeXml(`${base}/sitemap-en.xml`)}</loc></sitemap>\n  <sitemap><loc>${escapeXml(`${base}/sitemap-fr.xml`)}</loc></sitemap>\n</sitemapindex>\n`;
}
