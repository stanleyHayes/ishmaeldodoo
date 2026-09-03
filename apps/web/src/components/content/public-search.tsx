import Link from "next/link";
import type { SupportedLocale } from "../../lib/i18n/locale";
import {
  normalizeSearchQuery,
  searchPublicCatalogue,
} from "../../lib/search/public-search";

export function PublicSearch({
  locale,
  query,
}: Readonly<{ locale: SupportedLocale; query: string | undefined }>) {
  const french = locale === "fr-FR";
  const normalized = normalizeSearchQuery(query);
  const results = searchPublicCatalogue(normalized, locale);
  const archivePath = french ? "/fr/archive" : "/archive";
  const sourcesPath = french ? "/fr/record/sources" : "/record/sources";
  const suggestions: ReadonlyArray<readonly [string, string]> = french
    ? [
        ["carrière", "Carrière"],
        ["sources", "Sources"],
        ["presse", "Presse"],
      ]
    : [
        ["record", "Career record"],
        ["sources", "Sources"],
        ["press", "Press material"],
      ];
  const searchPath = french ? "/fr/search" : "/search";
  return (
    <main id="main-content" tabIndex={-1} className="site-frame search-page">
      <header className="search-page__hero">
        <div>
          <p className="section-context">
            {french ? "Dossier public" : "The public record"}
          </p>
          <h1>
            {french ? "Que cherchez-vous\u00a0?" : "What are you looking for?"}
          </h1>
        </div>
        <p className="search-page__intro">
          {french
            ? "Trouvez un sujet, une étape de carrière ou un document approuvé. Les espaces privés et administratifs ne figurent jamais dans les résultats."
            : "Find a subject, a career chapter or an approved document. Private and administrative areas never appear in results."}
        </p>
      </header>
      <form
        className="search-page__form"
        action={searchPath}
        method="get"
        role="search"
      >
        <label htmlFor="site-search">
          {french ? "Votre recherche" : "Your search"}
        </label>
        <div>
          <input
            id="site-search"
            name="q"
            defaultValue={normalized}
            maxLength={100}
            placeholder={
              french
                ? "Ex. Sahel, sources, presse"
                : "Try Sahel, sources or press"
            }
          />
          <button type="submit">
            <span>{french ? "Rechercher" : "Search"}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        <p>
          {french ? "Essayez\u00a0:" : "Try:"}{" "}
          {suggestions.map(([value, label], index) => (
            <span key={value}>
              {index > 0 ? " · " : ""}
              <Link href={`${searchPath}?q=${encodeURIComponent(value)}`}>
                {label}
              </Link>
            </span>
          ))}
        </p>
      </form>
      {normalized ? (
        <section
          className="search-page__results"
          aria-live="polite"
          aria-labelledby="search-results-title"
        >
          <header>
            <p>{french ? "Résultats pour" : "Results for"}</p>
            <h2 id="search-results-title">“{normalized}”</h2>
            <span>
              {results.length.toLocaleString(locale)}{" "}
              {french
                ? results.length === 1
                  ? "résultat"
                  : "résultats"
                : results.length === 1
                  ? "result"
                  : "results"}
            </span>
          </header>
          {results.length ? (
            <ul className="search-results">
              {results.map((result, index) => (
                <li key={result.href}>
                  <span aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <Link href={result.href}>{result.title}</Link>
                    <p>{result.description}</p>
                  </div>
                  <span aria-hidden="true">↗</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="search-page__empty">
              <span aria-hidden="true">⌕</span>
              <div>
                <h3>
                  {french ? "Aucun résultat public" : "No public result found"}
                </h3>
                <p>
                  {french
                    ? "Essayez un terme plus court ou utilisez l’une des recherches spécialisées ci-dessous."
                    : "Try a shorter term, or continue with one of the specialist searches below."}
                </p>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section
          className="search-page__start"
          aria-labelledby="search-start-title"
        >
          <p>01</p>
          <div>
            <h2 id="search-start-title">
              {french ? "Commencez par une idée" : "Start with an idea"}
            </h2>
            <p>
              {french
                ? "Recherchez un lieu, une institution, un thème, une intervention ou une source. Nous vous conduirons uniquement vers le contenu public approuvé."
                : "Search for a place, institution, theme, speech or source. We will only take you to approved public material."}
            </p>
          </div>
        </section>
      )}
      <aside
        className="search-page__handoffs"
        aria-label={french ? "Recherches spécialisées" : "Specialist searches"}
      >
        <div>
          <p>02</p>
          <h2>
            {french
              ? "Besoin de plus de précision\u00a0?"
              : "Need a deeper search?"}
          </h2>
        </div>
        <p>
          {french
            ? "Cherchez mot à mot dans les transcriptions publiées."
            : "Search word-for-word across published transcripts."}
          <Link
            href={`${archivePath}${normalized ? `?q=${encodeURIComponent(normalized)}` : ""}`}
          >
            {french ? "Ouvrir les archives" : "Open the Archive"}
            <span aria-hidden="true">↗</span>
          </Link>
        </p>
        <p>
          {french
            ? "Vérifiez les documents qui étayent le dossier public."
            : "Check the documents behind claims in the public record."}
          <Link
            href={`${sourcesPath}${normalized ? `?q=${encodeURIComponent(normalized)}` : ""}`}
          >
            {french
              ? "Ouvrir le registre des sources"
              : "Open the Source Register"}
            <span aria-hidden="true">↗</span>
          </Link>
        </p>
      </aside>
    </main>
  );
}
