import Link from "next/link";
import type { PublicSourcesResult } from "../../lib/content/public-sources-client";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";

export function SourceRegister({
  result,
  locale,
  query,
}: Readonly<{
  result: PublicSourcesResult;
  locale: SupportedLocale;
  query: string;
}>) {
  const french = locale === "fr-FR";
  const basePath = localizePath("/record/sources", locale);
  const page = result.status === "available" ? result.page : null;
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="site-frame source-register"
    >
      <nav
        className="breadcrumbs"
        aria-label={french ? "Fil d’Ariane" : "Breadcrumb"}
      >
        <ol>
          <li>
            <Link href={localizePath("/", locale)}>
              {french ? "Accueil" : "Home"}
            </Link>
          </li>
          <li>
            <Link href={localizePath("/record", locale)}>
              {french ? "Le parcours" : "The Record"}
            </Link>
          </li>
          <li>
            <span aria-current="page">{french ? "Sources" : "Sources"}</span>
          </li>
        </ol>
      </nav>
      <header className="source-register__hero">
        <p className="page-kicker">
          {french ? "Registre public" : "Public register"}
        </p>
        <h1>
          {french
            ? "Les sources derrière le parcours."
            : "The sources behind the record."}
        </h1>
        <p>
          {french
            ? "Documents publics utilisés pour étayer les affirmations factuelles. Les notes éditoriales internes ne sont jamais publiées."
            : "Published material used to support factual claims. Internal editorial notes are never exposed here."}
        </p>
      </header>
      <form
        className="source-search"
        action={basePath}
        method="get"
        role="search"
      >
        <label htmlFor="source-query">
          {french
            ? "Rechercher par titre, éditeur ou référence"
            : "Search by title, publisher or reference"}
        </label>
        <div>
          <input
            id="source-query"
            name="q"
            defaultValue={query}
            maxLength={100}
          />
          <button type="submit">{french ? "Rechercher" : "Search"}</button>
        </div>
      </form>
      {!page ? (
        <p className="register-state" role="status">
          {french
            ? "Le registre des sources est temporairement indisponible."
            : "The Source Register is temporarily unavailable."}
        </p>
      ) : page.items.length === 0 ? (
        <p className="register-state">
          {query
            ? french
              ? "Aucune source ne correspond à cette recherche."
              : "No sources match this search."
            : french
              ? "Aucune source approuvée n’est encore publiée."
              : "No approved sources have been published yet."}
        </p>
      ) : (
        <ol className="source-list">
          {page.items.map((source) => (
            <li id={source.ref} key={source.ref}>
              <div>
                <code>{source.ref}</code>
                <span>{source.type}</span>
              </div>
              <h2>{source.title}</h2>
              <p>{source.publisher}</p>
              <p className="source-accessed">
                {french ? "Consulté le" : "Accessed"}{" "}
                {source.accessedAt.toLocaleDateString(
                  french ? "fr-FR" : "en-GB",
                  { dateStyle: "long", timeZone: "UTC" },
                )}
              </p>
              {source.url ? (
                <a href={source.url} rel="noreferrer">
                  {french ? "Ouvrir la source" : "Open source"}
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {page?.nextCursor ? (
        <Link
          className="register-next"
          href={`${basePath}?${new URLSearchParams({ ...(query ? { q: query } : {}), cursor: page.nextCursor }).toString()}`}
        >
          {french ? "Sources suivantes" : "Next sources"}
        </Link>
      ) : null}
    </main>
  );
}
