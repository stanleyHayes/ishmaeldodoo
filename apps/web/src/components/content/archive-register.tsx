import type { PublicArchive, PublicArchiveItem } from "@amanor/contracts";
import Link from "next/link";
import { structuredDataJson } from "../../lib/discoverability/structured-data";
import type { SupportedLocale } from "../../lib/i18n/locale";
import { QuotableTranscript } from "./quotable-transcript";

const archiveTypes = [
  "speech",
  "interview",
  "panel",
  "article",
  "broadcast",
] as const;

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function mediaAt(url: string, seconds: number): string {
  const target = new URL(url);
  target.hash = `t=${seconds}`;
  return target.toString();
}

function structuredEntry(item: PublicArchiveItem, url: string) {
  if (item.type === "article")
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: item.title,
      datePublished: item.date.toISOString(),
      inLanguage: item.language,
      mainEntityOfPage: url,
      url,
    };
  if (item.type === "broadcast" && item.mediaUrl)
    return {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: item.title,
      uploadDate: item.date.toISOString(),
      inLanguage: item.language,
      contentUrl: item.mediaUrl,
      url,
    };
  return null;
}

export function ArchiveRegister({
  archive,
  locale,
  query = "",
  type,
  baseUrl,
  speakerName,
}: Readonly<{
  archive: PublicArchive;
  locale: SupportedLocale;
  query?: string;
  type?: string;
  baseUrl: string;
  speakerName?: string;
}>) {
  const french = locale === "fr-FR";
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const selectedType = archiveTypes.find((value) => value === type);
  const items = archive.items.filter(
    (item) =>
      (!selectedType || item.type === selectedType) &&
      (!normalizedQuery ||
        [
          item.title,
          item.venue,
          item.city,
          item.country,
          item.transcript,
          ...(item.transcriptSegments?.map((segment) => segment.text) ?? []),
        ]
          .filter(Boolean)
          .some((value) =>
            value!.toLocaleLowerCase(locale).includes(normalizedQuery),
          )),
  );
  const route = french ? "/fr/archive" : "/archive";
  const absoluteBase = baseUrl.replace(/\/$/u, "");
  return (
    <section className="archive-register" aria-labelledby="archive-heading">
      <header>
        <p className="section-number">01</p>
        <div>
          <h2 id="archive-heading">
            {french ? "Registre des archives" : "Archive register"}
          </h2>
          <p>
            {french
              ? "Discours, entretiens, tables rondes, articles et émissions publiés."
              : "Published speeches, interviews, panels, articles and broadcasts."}
          </p>
        </div>
      </header>
      {french && archive.translation.stale ? (
        <p className="translation-notice" role="status">
          Traduction en cours de révision. Texte source mis à jour le{" "}
          {archive.translation.sourceUpdatedAt
            ? archive.translation.sourceUpdatedAt.toLocaleDateString("fr-FR", {
                timeZone: "UTC",
              })
            : "date non disponible"}
          .
        </p>
      ) : null}
      <form action={route} method="get" className="archive-filters">
        <label>
          <span>{french ? "Rechercher" : "Search"}</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={100}
            placeholder={
              french ? "Titre, lieu ou pays" : "Title, venue or country"
            }
          />
        </label>
        <label>
          <span>{french ? "Type" : "Type"}</span>
          <select name="type" defaultValue={selectedType ?? ""}>
            <option value="">{french ? "Tous" : "All"}</option>
            {archiveTypes.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{french ? "Appliquer" : "Apply"}</button>
        {query || selectedType ? (
          <Link href={route}>{french ? "Effacer" : "Clear"}</Link>
        ) : null}
      </form>
      <p className="archive-count" role="status">
        {items.length}{" "}
        {french ? "résultat(s) publié(s)" : "published result(s)"}
      </p>
      {items.length ? (
        <ol className="archive-list">
          {items.map((item) => {
            const itemUrl = `${absoluteBase}${route}#${encodeURIComponent(item.slug)}`;
            const structured = structuredEntry(item, itemUrl);
            const matchingSegment = normalizedQuery
              ? item.transcriptSegments?.find((segment) =>
                  segment.text
                    .toLocaleLowerCase(locale)
                    .includes(normalizedQuery),
                )
              : undefined;
            return (
              <li id={item.slug} key={item.documentId}>
                <div className="archive-meta">
                  <time dateTime={item.date.toISOString()}>
                    {item.date.toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </time>
                  <span>{item.type}</span>
                </div>
                <h3>{item.title}</h3>
                {matchingSegment ? (
                  <p className="archive-search-hit">
                    <span>{matchingSegment.text}</span>
                    {item.mediaUrl ? (
                      <a
                        href={mediaAt(
                          item.mediaUrl,
                          matchingSegment.startSeconds,
                        )}
                      >
                        {french
                          ? `Lire à ${duration(matchingSegment.startSeconds)}`
                          : `Play at ${duration(matchingSegment.startSeconds)}`}
                      </a>
                    ) : null}
                  </p>
                ) : null}
                {[item.venue, item.city, item.country].filter(Boolean)
                  .length ? (
                  <p>
                    {[item.venue, item.city, item.country]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {item.chapters?.length ? (
                  <nav
                    className="archive-chapters"
                    aria-label={
                      french
                        ? `Chapitres de ${item.title}`
                        : `Chapters for ${item.title}`
                    }
                  >
                    <h4>{french ? "Chapitres" : "Chapters"}</h4>
                    <ol>
                      {item.chapters.map((chapter) => {
                        const chapterId = `${item.slug}-${chapter.slug}`;
                        return (
                          <li id={chapterId} key={chapter.slug}>
                            <a href={`#${chapterId}`}>{chapter.label}</a>
                            <span>
                              {duration(chapter.startSeconds)}
                              {chapter.endSeconds !== undefined
                                ? `–${duration(chapter.endSeconds)}`
                                : ""}
                            </span>
                            {item.mediaUrl ? (
                              <a
                                href={mediaAt(
                                  item.mediaUrl,
                                  chapter.startSeconds,
                                )}
                              >
                                {french
                                  ? "Lire à partir d’ici"
                                  : "Play from here"}
                              </a>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </nav>
                ) : null}
                <div className="archive-actions">
                  {item.mediaUrl ? (
                    <a href={item.mediaUrl}>
                      {french ? "Voir le média" : "View media"}
                    </a>
                  ) : null}
                  {item.transcript ? (
                    <details>
                      <summary>
                        {french ? "Lire la transcription" : "Read transcript"} ·{" "}
                        {item.transcriptStatus === "corrected"
                          ? french
                            ? "corrigée"
                            : "corrected"
                          : french
                            ? "automatique"
                            : "machine"}
                      </summary>
                      <QuotableTranscript
                        transcript={item.transcript}
                        transcriptStatus={item.transcriptStatus}
                        {...(speakerName ? { speakerName } : {})}
                        title={item.title}
                        type={item.type}
                        {...(item.venue ? { venue: item.venue } : {})}
                        {...(item.city ? { city: item.city } : {})}
                        date={item.date}
                        url={itemUrl}
                        locale={locale}
                      />
                    </details>
                  ) : null}
                </div>
                {item.corrections?.length ? (
                  <section
                    className="archive-corrections"
                    aria-labelledby={`${item.slug}-corrections`}
                  >
                    <h4 id={`${item.slug}-corrections`}>
                      {french ? "Journal des corrections" : "Correction log"}
                    </h4>
                    <ol>
                      {item.corrections.map((correction) => (
                        <li
                          key={`${correction.issuedAt.toISOString()}-${correction.sourceRef}`}
                        >
                          <time dateTime={correction.issuedAt.toISOString()}>
                            {correction.issuedAt.toLocaleDateString(locale, {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              timeZone: "UTC",
                            })}
                          </time>
                          <p>
                            <del>{correction.incorrectQuote}</del>
                          </p>
                          <p>{correction.correction}</p>
                          <Link
                            href={`${french ? "/fr" : ""}/record/sources#${encodeURIComponent(correction.sourceRef)}`}
                          >
                            {french
                              ? "Source de la correction"
                              : "Correction source"}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
                {structured ? (
                  <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                      __html: structuredDataJson(structured),
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="register-state">
          {french
            ? "Aucune archive publiée ne correspond à ces filtres."
            : "No published Archive entries match these filters."}
        </p>
      )}
    </section>
  );
}
