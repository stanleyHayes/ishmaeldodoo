import type { PublicAtlasResult } from "../../lib/content/public-atlas-client";
import type { SupportedLocale } from "../../lib/i18n/locale";
import { AtlasFilterAnalytics } from "./atlas-analytics";
import { AtlasTable, type AtlasFilters } from "./atlas-table";

export function AtlasTablePage({
  result,
  locale,
  filters,
}: Readonly<{
  result: PublicAtlasResult;
  locale: SupportedLocale;
  filters: AtlasFilters;
}>) {
  const french = locale === "fr-FR";
  const base = `${french ? "/fr" : ""}/record/atlas`;
  const basePath = `${base}/table`;
  return (
    <main id="main-content" tabIndex={-1} className="site-frame press-room">
      <AtlasFilterAnalytics
        locale={locale}
        route={basePath}
        filtered={Object.values(filters).some(Boolean)}
      />
      <header className="press-hero">
        <p className="page-kicker">{french ? "Le parcours" : "The Record"}</p>
        <h1>{french ? "L’Atlas" : "The Atlas"}</h1>
        <p>
          {french
            ? "Vingt-cinq années, lisibles dans un tableau accessible et léger."
            : "Twenty-five years in an accessible, lightweight table."}
        </p>
        <a href={`${base}?map=1`}>
          {french ? "Charger la carte interactive" : "Load the interactive map"}
        </a>
      </header>
      {result.status === "available" ? (
        <section className="press-section">
          <div>
            <p className="section-number">01</p>
            <h2>{french ? "Tableau accessible" : "Accessible table"}</h2>
          </div>
          <div>
            {result.translation.stale && french ? (
              <p className="translation-notice" role="status">
                Traduction en cours de révision. Texte source mis à jour le{" "}
                {result.translation.sourceUpdatedAt
                  ? result.translation.sourceUpdatedAt.toLocaleDateString(
                      "fr-FR",
                      { timeZone: "UTC" },
                    )
                  : "date non disponible"}
                .
              </p>
            ) : null}
            <AtlasTable
              items={result.items}
              locale={locale}
              filters={filters}
              basePath={basePath}
            />
          </div>
        </section>
      ) : (
        <p className="register-state">
          {french
            ? "L’Atlas publié n’est pas disponible."
            : "The published Atlas is unavailable."}
        </p>
      )}
    </main>
  );
}
