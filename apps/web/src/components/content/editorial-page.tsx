import Link from "next/link";
import type { PublicContentResult } from "../../lib/content/public-content-client";
import type { ReactNode } from "react";
import { structuredDataJson } from "../../lib/discoverability/structured-data";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";

type PageSection = Readonly<{
  key: string;
  heading?: string;
  body: string;
  sourceRefs?: readonly string[];
}>;
type PagePayload = Readonly<{
  slug: string;
  title: string;
  summary: string;
  sections: readonly PageSection[];
  seoTitle: string;
  seoDescription: string;
  noIndex: boolean;
  faqs?: readonly Readonly<{
    question: string;
    answer: string;
    sourceRefs: readonly string[];
  }>[];
}>;

function pagePayload(value: unknown): PagePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<PagePayload>;
  if (
    typeof candidate.slug !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.summary !== "string" ||
    !Array.isArray(candidate.sections) ||
    !candidate.sections.every(
      (section) =>
        section &&
        typeof section.key === "string" &&
        typeof section.body === "string",
    ) ||
    (candidate.faqs !== undefined &&
      (!Array.isArray(candidate.faqs) ||
        !candidate.faqs.every(
          (faq) =>
            faq &&
            typeof faq.question === "string" &&
            typeof faq.answer === "string" &&
            Array.isArray(faq.sourceRefs) &&
            faq.sourceRefs.length > 0 &&
            faq.sourceRefs.every(
              (reference: unknown) => typeof reference === "string",
            ),
        )))
  )
    return null;
  return candidate as PagePayload;
}

export function Breadcrumbs({
  path,
  locale,
}: Readonly<{ path: string; locale: SupportedLocale }>) {
  const parts = path.split("/").filter(Boolean);
  const labels = locale === "fr-FR" ? { home: "Accueil" } : { home: "Home" };
  const items = [
    { name: labels.home, href: localizePath("/", locale) },
    ...parts.map((part, index) => ({
      name: part.replaceAll("-", " "),
      href: localizePath(`/${parts.slice(0, index + 1).join("/")}`, locale),
    })),
  ];
  const structured = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.href,
    })),
  };
  return (
    <>
      <nav
        className="breadcrumbs"
        aria-label={locale === "fr-FR" ? "Fil d’Ariane" : "Breadcrumb"}
      >
        <ol>
          {items.map((item, index) => (
            <li key={item.href}>
              {index === items.length - 1 ? (
                <span aria-current="page">{item.name}</span>
              ) : (
                <Link href={item.href}>{item.name}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataJson(structured) }}
      />
    </>
  );
}

export function EditorialPage({
  result,
  path,
  locale,
  children,
}: Readonly<{
  result: PublicContentResult;
  path: string;
  locale: SupportedLocale;
  children?: ReactNode;
}>) {
  const payload =
    result.status === "available" ? pagePayload(result.content.payload) : null;
  const french = locale === "fr-FR";
  const faqs = payload?.faqs ?? [];
  if (!payload)
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="site-frame editorial-page"
      >
        <Breadcrumbs path={path} locale={locale} />
        <section
          className="content-state"
          aria-labelledby="content-state-title"
        >
          <p className="page-kicker">
            {french ? "Publication contrôlée" : "Controlled publication"}
          </p>
          <h1 id="content-state-title">
            {french
              ? "Cette page attend son contenu approuvé."
              : "This page is awaiting approved content."}
          </h1>
          <p>
            {result.status === "unavailable"
              ? french
                ? "Le service de contenu est temporairement indisponible. Réessayez sous peu."
                : "The content service is temporarily unavailable. Please try again shortly."
              : french
                ? "Aucune version approuvée n’est encore publiée dans cette langue."
                : "No approved version has been published in this language yet."}
          </p>
        </section>
      </main>
    );
  return (
    <main id="main-content" tabIndex={-1} className="site-frame editorial-page">
      <Breadcrumbs path={path} locale={locale} />
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
      <header className="editorial-hero">
        <p className="page-kicker">
          {french ? "Dossier public" : "Public record"}
        </p>
        <h1>{payload.title}</h1>
        <p>{payload.summary}</p>
      </header>
      <div className="editorial-sections">
        {payload.sections.map((section, index) => (
          <section
            id={section.key}
            key={section.key}
            className="editorial-section"
          >
            <p className="section-number">
              {String(index + 1).padStart(2, "0")}
            </p>
            <div>
              {section.heading ? <h2>{section.heading}</h2> : null}
              <div className="section-body">
                {section.body
                  .split("\n")
                  .filter(Boolean)
                  .map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
              </div>
              {section.sourceRefs && section.sourceRefs.length > 0 ? (
                <p className="source-line">
                  {french ? "Sources\u00a0:" : "Sources:"}{" "}
                  {section.sourceRefs.map((reference, sourceIndex) => (
                    <span key={reference}>
                      {sourceIndex > 0 ? ", " : null}
                      <Link
                        href={localizePath(
                          `/record/sources#${reference}`,
                          locale,
                        )}
                      >
                        {reference}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          </section>
        ))}
      </div>
      {faqs.length > 0 ? (
        <section className="editorial-section" aria-labelledby="faq-heading">
          <div>
            <h2 id="faq-heading">
              {french ? "Questions fréquentes" : "Frequently asked questions"}
            </h2>
            <dl>
              {faqs.map((faq) => (
                <div key={faq.question}>
                  <dt>{faq.question}</dt>
                  <dd>
                    <p>{faq.answer}</p>
                    <p className="source-line">
                      {french ? "Sources\u00a0:" : "Sources:"}{" "}
                      {faq.sourceRefs.map((reference, index) => (
                        <span key={reference}>
                          {index > 0 ? ", " : null}
                          <Link
                            href={localizePath(
                              `/record/sources#${reference}`,
                              locale,
                            )}
                          >
                            {reference}
                          </Link>
                        </span>
                      ))}
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: structuredDataJson({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: faqs.map((faq) => ({
                    "@type": "Question",
                    name: faq.question,
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: faq.answer,
                    },
                  })),
                }),
              }}
            />
          </div>
        </section>
      ) : null}
      {children}
    </main>
  );
}

export function readPageMetadata(
  result: PublicContentResult,
): Readonly<{ title?: string; description?: string; noIndex: boolean }> {
  const payload =
    result.status === "available" ? pagePayload(result.content.payload) : null;
  return payload
    ? {
        title: payload.seoTitle || payload.title,
        description: payload.seoDescription || payload.summary,
        noIndex: payload.noIndex,
      }
    : { noIndex: true };
}
