import type { PublicAtlasNode, PublicMedia } from "@amanor/contracts";
import Link from "next/link";
import type { PublicContentResult } from "../../lib/content/public-content-client";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import { Breadcrumbs } from "./editorial-page";
import { RecordFieldImage } from "./record-field-image";
import { TwoLedgers, type LedgerView } from "./two-ledgers";

type RecordClaim = Readonly<{ body: string; sourceRefs: readonly string[] }>;
type RecordMarginalia = Readonly<{
  label: string;
  value: string;
  sourceRefs: readonly string[];
}>;
type RecordAct = Readonly<{
  key: string;
  heading: string;
  body: string;
  sourceRefs: readonly string[];
  recordAct: "forest" | "system" | "lite" | "return";
  dateline: string;
  fieldImage: string;
  imageCaption: string;
  claims: readonly RecordClaim[];
  marginalia: readonly RecordMarginalia[];
  pullQuote?: Readonly<{
    quote: string;
    venue: string;
    date: string | Date;
    sourceRef: string;
  }>;
}>;
type RecordPayload = Readonly<{
  title: string;
  summary: string;
  sections: readonly RecordAct[];
}>;
const actOrder = ["forest", "system", "lite", "return"] as const;

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function recordPayload(value: unknown): RecordPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const page = value as {
    title?: unknown;
    summary?: unknown;
    sections?: unknown;
  };
  if (
    typeof page.title !== "string" ||
    typeof page.summary !== "string" ||
    !Array.isArray(page.sections) ||
    page.sections.length !== 4
  )
    return null;
  const sections: RecordAct[] = [];
  for (const [index, raw] of page.sections.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const section = raw as Record<string, unknown>;
    if (
      section.recordAct !== actOrder[index] ||
      typeof section.key !== "string" ||
      typeof section.heading !== "string" ||
      typeof section.body !== "string" ||
      typeof section.dateline !== "string" ||
      typeof section.fieldImage !== "string" ||
      typeof section.imageCaption !== "string" ||
      !stringArray(section.sourceRefs) ||
      !Array.isArray(section.claims) ||
      !Array.isArray(section.marginalia)
    )
      return null;
    const claims = section.claims.filter(
      (claim): claim is RecordClaim =>
        Boolean(claim) &&
        typeof claim === "object" &&
        typeof (claim as RecordClaim).body === "string" &&
        stringArray((claim as RecordClaim).sourceRefs),
    );
    const marginalia = section.marginalia.filter(
      (item): item is RecordMarginalia =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as RecordMarginalia).label === "string" &&
        typeof (item as RecordMarginalia).value === "string" &&
        stringArray((item as RecordMarginalia).sourceRefs),
    );
    if (claims.length !== section.claims.length || claims.length === 0)
      return null;
    const quote = section.pullQuote as Record<string, unknown> | undefined;
    sections.push({
      key: section.key,
      heading: section.heading,
      body: section.body,
      sourceRefs: section.sourceRefs,
      recordAct: actOrder[index]!,
      dateline: section.dateline,
      fieldImage: section.fieldImage,
      imageCaption: section.imageCaption,
      claims,
      marginalia,
      ...(quote &&
      typeof quote.quote === "string" &&
      typeof quote.venue === "string" &&
      (typeof quote.date === "string" || quote.date instanceof Date) &&
      typeof quote.sourceRef === "string"
        ? {
            pullQuote: {
              quote: quote.quote,
              venue: quote.venue,
              date: quote.date,
              sourceRef: quote.sourceRef,
            },
          }
        : {}),
    });
  }
  return { title: page.title, summary: page.summary, sections };
}

export function recordFieldImageIds(result: PublicContentResult): string[] {
  const payload =
    result.status === "available"
      ? recordPayload(result.content.payload)
      : null;
  return payload ? payload.sections.map((section) => section.fieldImage) : [];
}

function Sources({
  refs,
  locale,
}: Readonly<{ refs: readonly string[]; locale: SupportedLocale }>) {
  return (
    <sup className="record-sources">
      {refs.map((ref, index) => (
        <Link
          key={ref}
          href={`${localizePath("/record/sources", locale)}#${ref}`}
          aria-label={`${locale === "fr-FR" ? "Source" : "Source"} ${ref}`}
        >
          {index + 1}
        </Link>
      ))}
    </sup>
  );
}

export function RecordPage({
  result,
  atlas,
  locale,
  ledger,
  lite,
  media,
}: Readonly<{
  result: PublicContentResult;
  atlas: readonly PublicAtlasNode[];
  locale: SupportedLocale;
  ledger: LedgerView;
  lite: boolean;
  media?: Readonly<Record<string, PublicMedia | undefined>>;
}>) {
  const french = locale === "fr-FR";
  const payload =
    result.status === "available"
      ? recordPayload(result.content.payload)
      : null;
  if (!payload)
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="site-frame editorial-page"
      >
        <Breadcrumbs path="/record" locale={locale} />
        <section className="content-state">
          <p className="page-kicker">
            {french ? "Publication contrôlée" : "Controlled publication"}
          </p>
          <h1>
            {french
              ? "Le parcours attend son récit approuvé."
              : "The Record is awaiting its approved narrative."}
          </h1>
          <p>
            {french
              ? "Les quatre actes ne seront publiés qu’ensemble, avec leurs images et leurs sources."
              : "All four acts publish together with their governed images and sources."}
          </p>
        </section>
      </main>
    );
  return (
    <main id="main-content" tabIndex={-1} className="site-frame record-page">
      <Breadcrumbs path="/record" locale={locale} />
      {french &&
      result.status === "available" &&
      result.content.translation.stale ? (
        <p className="translation-notice" role="status">
          Traduction en cours de révision. Texte source mis à jour le{" "}
          {result.content.translation.sourceUpdatedAt
            ? result.content.translation.sourceUpdatedAt.toLocaleDateString(
                "fr-FR",
                { timeZone: "UTC" },
              )
            : "date non disponible"}
          .
        </p>
      ) : null}
      <header className="record-hero">
        <p className="page-kicker">{french ? "Le parcours" : "The Record"}</p>
        <h1>{payload.title}</h1>
        <p>{payload.summary}</p>
      </header>
      <nav
        className="record-progress"
        aria-label={french ? "Progression du récit" : "Story progress"}
      >
        <ol>
          {payload.sections.map((section, index) => (
            <li key={section.key}>
              <a href={`#${section.key}`}>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {section.heading}
              </a>
            </li>
          ))}
          <li>
            <a href="#current-position">
              <span aria-hidden="true">05</span>
              {french ? "Position actuelle" : "Current position"}
            </a>
          </li>
        </ol>
      </nav>
      <div className="record-acts">
        {payload.sections.map((section, index) => (
          <article id={section.key} key={section.key} className="record-act">
            <header>
              <p className="section-number">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="record-dateline">{section.dateline}</p>
              <h2>{section.heading}</h2>
            </header>
            <RecordFieldImage
              media={media?.[section.fieldImage]}
              caption={section.imageCaption}
              locale={locale}
              lite={lite}
            />
            <div className="record-act__grid">
              <div className="record-narrative">
                {section.body
                  .split("\n")
                  .filter(Boolean)
                  .map((paragraph) => (
                    <p key={paragraph}>
                      {paragraph}
                      <Sources refs={section.sourceRefs} locale={locale} />
                    </p>
                  ))}
                {section.claims.flatMap((claim) =>
                  claim.body
                    .split("\n")
                    .filter(Boolean)
                    .map((paragraph) => (
                      <p key={`${claim.sourceRefs.join("-")}-${paragraph}`}>
                        {paragraph}
                        <Sources refs={claim.sourceRefs} locale={locale} />
                      </p>
                    )),
                )}
                {section.pullQuote ? (
                  <blockquote>
                    <p>“{section.pullQuote.quote}”</p>
                    <cite>
                      {section.pullQuote.venue} ·{" "}
                      {new Date(section.pullQuote.date).toLocaleDateString(
                        locale,
                        {
                          timeZone: "UTC",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                      <Sources
                        refs={[section.pullQuote.sourceRef]}
                        locale={locale}
                      />
                    </cite>
                  </blockquote>
                ) : null}
              </div>
              <aside
                className="record-marginalia"
                aria-label={
                  french
                    ? `Notes pour ${section.heading}`
                    : `Notes for ${section.heading}`
                }
              >
                {section.marginalia.map((item) => (
                  <div key={`${item.label}-${item.value}`}>
                    <p>{item.label}</p>
                    <strong>{item.value}</strong>
                    <Sources refs={item.sourceRefs} locale={locale} />
                  </div>
                ))}
              </aside>
            </div>
          </article>
        ))}
      </div>
      <section id="current-position" className="record-current-position">
        <p className="section-number">05</p>
        <h2>{french ? "La position actuelle" : "The current position"}</h2>
        <p>
          {french
            ? "Le récit se poursuit dans les preuves vérifiables ci-dessous."
            : "The narrative continues into the verifiable evidence below."}
        </p>
        <Link href={localizePath("/record/atlas", locale)}>
          {french ? "Explorer l’Atlas" : "Explore the Atlas"}
        </Link>
      </section>
      {atlas.length ? (
        <TwoLedgers items={atlas} locale={locale} initialView={ledger} />
      ) : null}
    </main>
  );
}
