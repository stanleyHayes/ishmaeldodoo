import type { PublicArchive } from "@amanor/contracts";
import type { SupportedLocale } from "../i18n/locale";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function archiveAtomFeed(
  input: Readonly<{
    archive: PublicArchive;
    baseUrl: string;
    locale: SupportedLocale;
  }>,
): string {
  const base = input.baseUrl.replace(/\/$/u, "");
  const french = input.locale === "fr-FR";
  const archivePath = french ? "/fr/archive" : "/archive";
  const feedPath = french ? "/fr/feed.xml" : "/feed.xml";
  const alternateFeedPath = french ? "/feed.xml" : "/fr/feed.xml";
  const updated =
    input.archive.items[0]?.publishedAt ?? new Date("1970-01-01T00:00:00.000Z");
  const entries = input.archive.items
    .map((item) => {
      const itemUrl = `${base}${archivePath}#${encodeURIComponent(item.slug)}`;
      const location = [item.venue, item.city, item.country]
        .filter(Boolean)
        .join(" · ");
      const summary = [item.type, location].filter(Boolean).join(" · ");
      return `<entry><id>${escapeXml(itemUrl)}</id><title>${escapeXml(item.title)}</title><link href="${escapeXml(itemUrl)}"/><published>${item.date.toISOString()}</published><updated>${item.publishedAt.toISOString()}</updated><summary>${escapeXml(summary)}</summary></entry>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${french ? "fr" : "en"}"><id>${base}${feedPath}</id><title>${french ? "Project AMANOR — Archives" : "Project AMANOR — Archive"}</title><updated>${updated.toISOString()}</updated><link rel="self" type="application/atom+xml" href="${base}${feedPath}"/><link rel="alternate" hreflang="${french ? "en-GB" : "fr-FR"}" type="application/atom+xml" href="${base}${alternateFeedPath}"/><link rel="alternate" type="text/html" href="${base}${archivePath}"/>${entries}</feed>`;
}
