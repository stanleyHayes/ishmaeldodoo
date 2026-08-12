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
  return (
    <main id="main-content" className="site-frame search-page">
      <p className="section-context">
        {french ? "Navigation publique" : "Public navigation"}
      </p>
      <h1>{french ? "Recherche" : "Search"}</h1>
      <p className="search-page__intro">
        {french
          ? "Recherchez les sections publiques approuvées de la plateforme. Les espaces privés et administratifs ne sont jamais indexés."
          : "Find approved public sections of the platform. Private and administrative areas are never indexed."}
      </p>
      <form
        className="search-page__form"
        action={french ? "/fr/search" : "/search"}
        method="get"
        role="search"
      >
        <label htmlFor="site-search">
          {french ? "Rechercher sur le site" : "Search the site"}
        </label>
        <div>
          <input
            id="site-search"
            name="q"
            defaultValue={normalized}
            maxLength={100}
          />
          <button type="submit">{french ? "Rechercher" : "Search"}</button>
        </div>
      </form>
      {normalized ? (
        <section aria-live="polite" aria-labelledby="search-results-title">
          <h2 id="search-results-title">
            {french
              ? `${results.length} résultat(s)`
              : `${results.length} result(s)`}
          </h2>
          {results.length ? (
            <ul className="search-results">
              {results.map((result) => (
                <li key={result.href}>
                  <Link href={result.href}>{result.title}</Link>
                  <p>{result.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {french
                ? "Aucune section publique ne correspond."
                : "No public section matches."}
            </p>
          )}
        </section>
      ) : null}
      <aside
        className="search-page__handoffs"
        aria-label={french ? "Recherches spécialisées" : "Specialist searches"}
      >
        <h2>{french ? "Recherches spécialisées" : "Specialist searches"}</h2>
        <p>
          <Link
            href={`${archivePath}${normalized ? `?q=${encodeURIComponent(normalized)}` : ""}`}
          >
            {french
              ? "Rechercher dans les transcriptions des archives"
              : "Search Archive transcripts"}
          </Link>
        </p>
        <p>
          <Link
            href={`${sourcesPath}${normalized ? `?q=${encodeURIComponent(normalized)}` : ""}`}
          >
            {french
              ? "Rechercher dans le Registre des sources"
              : "Search the Source Register"}
          </Link>
        </p>
      </aside>
    </main>
  );
}
