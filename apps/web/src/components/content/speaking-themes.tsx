import {
  speakingFormats,
  type PublicMedia,
  type PublicSpeaking,
  type PublicSpeakingTheme,
} from "@amanor/contracts";
import Image from "next/image";
import Link from "next/link";
import { structuredDataJson } from "../../lib/discoverability/structured-data";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import styles from "./speaking-evidence.module.css";

type SpeakingFormat = (typeof speakingFormats)[number];

const labels: Record<
  SupportedLocale,
  Readonly<{
    eyebrow: string;
    heading: string;
    intro: string;
    format: string;
    all: string;
    apply: string;
    reset: string;
    audiences: string;
    sources: string;
    featured: string;
    request: string;
    history: string;
    media: string;
    loadMedia: string;
    empty: string;
    count: (value: number) => string;
    formats: Record<SpeakingFormat, string>;
  }>
> = {
  "en-GB": {
    eyebrow: "Speaking themes",
    heading: "Speaking themes matched to the right audience",
    intro:
      "Explore the governed themes currently available for keynotes, working sessions and institutional conversations.",
    format: "Format",
    all: "All formats",
    apply: "Apply",
    reset: "Reset",
    audiences: "Suited audiences",
    sources: "Sources",
    featured: "Featured theme",
    request: "Open the Protocol Desk",
    history: "Selected speaking history",
    media: "Media",
    loadMedia: "Load this media in standard mode",
    empty: "No published theme matches this format.",
    count: (value) => `${value} published ${value === 1 ? "theme" : "themes"}`,
    formats: {
      keynote: "Keynote",
      plenary_panel: "Plenary panel",
      fireside: "Fireside conversation",
      institutional_briefing: "Closed-door institutional briefing",
      media_interview: "Media interview",
      academic_lecture: "Academic lecture",
      youth_address: "Youth address",
      workshop: "Workshop",
    },
  },
  "fr-FR": {
    eyebrow: "Thèmes d’intervention",
    heading: "Des interventions conçues autour d’un résultat public",
    intro:
      "Découvrez les thèmes approuvés pour les conférences, les sessions de travail et les échanges institutionnels.",
    format: "Format",
    all: "Tous les formats",
    apply: "Appliquer",
    reset: "Réinitialiser",
    audiences: "Publics concernés",
    sources: "Sources",
    featured: "Thème à la une",
    request: "Ouvrir le Bureau du protocole",
    history: "Historique sélectionné",
    media: "Médias",
    loadMedia: "Charger ce média en mode standard",
    empty: "Aucun thème publié ne correspond à ce format.",
    count: (value) =>
      `${value} thème${value === 1 ? "" : "s"} publié${value === 1 ? "" : "s"}`,
    formats: {
      keynote: "Conférence",
      plenary_panel: "Table ronde plénière",
      fireside: "Conversation",
      institutional_briefing: "Briefing institutionnel à huis clos",
      media_interview: "Entretien avec les médias",
      academic_lecture: "Conférence universitaire",
      youth_address: "Discours jeunesse",
      workshop: "Atelier",
    },
  },
};

function isFormat(value?: string): value is SpeakingFormat {
  return speakingFormats.some((format) => format === value);
}

function structuredEvent(
  entry: NonNullable<PublicSpeakingTheme["history"]>[number],
  locale: SupportedLocale,
  url: string,
  sourcesUrl: string,
) {
  if (
    !entry.title.trim() ||
    !entry.host.trim() ||
    !entry.country.trim() ||
    !entry.sourceRefs.length ||
    Number.isNaN(entry.date.getTime())
  ) {
    return null;
  }
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: entry.title,
    startDate: entry.date.toISOString(),
    eventStatus: "https://schema.org/EventCompleted",
    inLanguage: locale,
    url,
    organizer: {
      "@type": "Organization",
      name: entry.host,
    },
    location: {
      "@type": "Place",
      ...(entry.city ? { name: entry.city } : {}),
      address: {
        "@type": "PostalAddress",
        ...(entry.city ? { addressLocality: entry.city } : {}),
        addressCountry: entry.country,
      },
    },
    subjectOf: entry.sourceRefs.map((reference) => ({
      "@type": "WebPage",
      url: `${sourcesUrl}#${encodeURIComponent(reference)}`,
    })),
  };
}

function ThemeCard({
  theme,
  locale,
  lite,
  mediaById,
}: Readonly<{
  theme: PublicSpeakingTheme;
  locale: SupportedLocale;
  lite: boolean;
  mediaById: Readonly<Record<string, PublicMedia>>;
}>) {
  const copy = labels[locale];
  return (
    <li id={theme.slug} className={theme.featured ? "is-featured" : undefined}>
      <div className="speaking-theme-meta">
        {theme.featured ? <strong>{copy.featured}</strong> : null}
        <ul aria-label={copy.format}>
          {theme.formats.map((format) => (
            <li key={format}>{copy.formats[format]}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3>{theme.title}</h3>
        <p>{theme.summary}</p>
        <h4>{copy.audiences}</h4>
        <ul className="speaking-outcomes">
          {theme.audiences.map((audience) => (
            <li key={audience}>{audience}</li>
          ))}
        </ul>
        <p className="source-line">
          {copy.sources}:{" "}
          {theme.sourceRefs.map((reference, index) => (
            <span key={reference}>
              {index ? ", " : ""}
              <Link
                href={`${localizePath("/record/sources", locale)}#${reference}`}
              >
                {reference}
              </Link>
            </span>
          ))}
        </p>
        {theme.history?.length ? (
          <section
            className={styles.history}
            aria-labelledby={`${theme.slug}-history`}
          >
            <h4 id={`${theme.slug}-history`}>{copy.history}</h4>
            <ol>
              {[...theme.history]
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .map((entry) => (
                  <li key={entry.slug} id={`${theme.slug}-${entry.slug}`}>
                    <time dateTime={entry.date.toISOString()}>
                      {entry.date.toLocaleDateString(locale, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    </time>
                    <div>
                      <strong>{entry.title}</strong>
                      <span>
                        {entry.host} ·{" "}
                        {[entry.city, entry.country].filter(Boolean).join(", ")}
                      </span>
                    </div>
                    <span>{copy.formats[entry.format]}</span>
                    <span className={`${styles.sourceLine} source-line`}>
                      {entry.sourceRefs.map((reference, index) => (
                        <span key={reference}>
                          {index ? ", " : ""}
                          <Link
                            href={`${localizePath("/record/sources", locale)}#${reference}`}
                          >
                            {reference}
                          </Link>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        ) : null}
        {theme.media?.length ? (
          <section
            className={styles.media}
            aria-labelledby={`${theme.slug}-media`}
          >
            <h4 id={`${theme.slug}-media`}>{copy.media}</h4>
            <div>
              {theme.media.map((item) => (
                <div key={item.assetId}>
                  {lite ? (
                    <div className="lite-media-placeholder">
                      <p>{item.caption}</p>
                      <a
                        href={`/api/lite?enabled=0&return=${encodeURIComponent(
                          `${localizePath("/speaking", locale)}#${theme.slug}`,
                        )}`}
                      >
                        {copy.loadMedia}
                      </a>
                      {item.relatedArchive ? (
                        <Link
                          href={`${localizePath("/archive", locale)}#${item.relatedArchive}`}
                        >
                          {locale === "fr-FR"
                            ? "Transcription et contexte"
                            : "Transcript and context"}
                        </Link>
                      ) : null}
                    </div>
                  ) : mediaById[item.assetId]?.resourceType === item.kind ? (
                    <figure className={styles.mediaItem}>
                      {item.kind === "image" ? (
                        <Image
                          src={mediaById[item.assetId]!.secureUrl}
                          alt={mediaById[item.assetId]!.altText}
                          width={mediaById[item.assetId]!.width ?? 1200}
                          height={mediaById[item.assetId]!.height ?? 800}
                        />
                      ) : (
                        <video
                          controls
                          preload="none"
                          src={mediaById[item.assetId]!.secureUrl}
                        >
                          {locale === "fr-FR"
                            ? "Votre navigateur ne prend pas en charge la vidéo."
                            : "Your browser does not support video."}
                        </video>
                      )}
                      <figcaption>
                        <span>{item.caption}</span>
                        <span>
                          {mediaById[item.assetId]!.credit} ·{" "}
                          {mediaById[item.assetId]!.licence}
                        </span>
                        {item.relatedArchive ? (
                          <Link
                            href={`${localizePath("/archive", locale)}#${item.relatedArchive}`}
                          >
                            {locale === "fr-FR"
                              ? "Transcription et contexte"
                              : "Transcript and context"}
                          </Link>
                        ) : null}
                      </figcaption>
                    </figure>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </li>
  );
}

export function SpeakingThemes({
  speaking,
  locale,
  format,
  lite = false,
  baseUrl,
  mediaById = {},
}: Readonly<{
  speaking: PublicSpeaking;
  locale: SupportedLocale;
  format?: string;
  lite?: boolean;
  baseUrl: string;
  mediaById?: Readonly<Record<string, PublicMedia>>;
}>) {
  const copy = labels[locale];
  const selected = isFormat(format) ? format : undefined;
  const items = [...speaking.items]
    .filter((theme) => !selected || theme.formats.includes(selected))
    .sort((a, b) =>
      a.featured === b.featured
        ? a.title.localeCompare(b.title, locale)
        : a.featured
          ? -1
          : 1,
    );
  const path = localizePath("/speaking", locale);
  const absoluteBase = baseUrl.replace(/\/$/u, "");
  const absolutePage = `${absoluteBase}${path}`;
  const sourcesUrl = `${absoluteBase}${localizePath("/record/sources", locale)}`;
  return (
    <section
      className="speaking-themes"
      aria-labelledby="speaking-themes-title"
    >
      <header>
        <p className="page-kicker">{copy.eyebrow}</p>
        <div>
          <h2 id="speaking-themes-title">{copy.heading}</h2>
          <p>{copy.intro}</p>
        </div>
      </header>
      {locale === "fr-FR" && speaking.translation.stale ? (
        <p className="translation-notice" role="status">
          Traduction en cours de révision. Texte source mis à jour le{" "}
          {speaking.translation.sourceUpdatedAt
            ? speaking.translation.sourceUpdatedAt.toLocaleDateString("fr-FR", {
                timeZone: "UTC",
              })
            : "date non disponible"}
          .
        </p>
      ) : null}
      <form action={path} method="get" className="speaking-filters">
        <label>
          {copy.format}
          <select name="format" defaultValue={selected ?? ""}>
            <option value="">{copy.all}</option>
            {speakingFormats.map((value) => (
              <option key={value} value={value}>
                {copy.formats[value]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{copy.apply}</button>
        {selected ? <Link href={path}>{copy.reset}</Link> : null}
      </form>
      <p className="archive-count" role="status">
        {copy.count(items.length)}
      </p>
      {items.length ? (
        <>
          <ol className="speaking-theme-list">
            {items.map((theme) => (
              <ThemeCard
                key={theme.documentId}
                theme={theme}
                locale={locale}
                lite={lite}
                mediaById={mediaById}
              />
            ))}
          </ol>
          {items.flatMap((theme) =>
            (theme.history ?? []).map((entry) => {
              const event = structuredEvent(
                entry,
                locale,
                `${absolutePage}#${theme.slug}-${entry.slug}`,
                sourcesUrl,
              );
              return event ? (
                <script
                  key={`${theme.documentId}-${entry.slug}-event`}
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{
                    __html: structuredDataJson(event),
                  }}
                />
              ) : null;
            }),
          )}
        </>
      ) : (
        <p className="register-state">{copy.empty}</p>
      )}
      <Link
        className="speaking-request"
        href={localizePath("/speaking/request", locale)}
      >
        {copy.request}
      </Link>
    </section>
  );
}
