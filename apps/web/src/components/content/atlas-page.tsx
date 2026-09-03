import type { PublicAtlasResult } from "../../lib/content/public-atlas-client";
import type { SupportedLocale } from "../../lib/i18n/locale";
import { AtlasFilterAnalytics } from "./atlas-analytics";
import { AtlasExplorer } from "./atlas-explorer";
import { AtlasTable, filterAtlasNodes, type AtlasFilters } from "./atlas-table";
import { TwoLedgers, type LedgerView } from "./two-ledgers";
export function AtlasPage({
  result,
  locale,
  filters,
  tileUrl,
  attribution,
  ledger = "diplomatic",
  lite = false,
  tableOnly = false,
  initialNode,
}: Readonly<{
  result: PublicAtlasResult;
  locale: SupportedLocale;
  filters: AtlasFilters;
  tileUrl: string;
  attribution: string;
  ledger?: LedgerView;
  lite?: boolean;
  tableOnly?: boolean;
  initialNode?: string;
}>) {
  const fr = locale === "fr-FR";
  const base = `${fr ? "/fr" : ""}/record/atlas`;
  const basePath = tableOnly ? `${base}/table` : base;
  const filtered =
    result.status === "available"
      ? filterAtlasNodes(result.items, filters)
      : [];
  const hasFilters = Object.values(filters).some(Boolean);
  return (
    <main id="main-content" tabIndex={-1} className="site-frame press-room">
      <AtlasFilterAnalytics
        locale={locale}
        route={basePath}
        filtered={hasFilters}
        lite={lite}
      />
      <header className="press-hero">
        <p className="page-kicker">{fr ? "Le parcours" : "The Record"}</p>
        <h1>{fr ? "L’Atlas" : "The Atlas"}</h1>
        <p>
          {fr
            ? "Explorez vingt-cinq années de fonctions, de lieux et de résultats."
            : "Explore twenty-five years of roles, places and results."}
        </p>
        {!tableOnly ? (
          <a href={`${base}/table`}>
            {fr
              ? "Voir toutes les entrées dans un tableau"
              : "View all entries as a table"}
          </a>
        ) : (
          <a href={base}>{fr ? "Ouvrir la carte" : "Open map view"}</a>
        )}
      </header>
      {result.status === "available" ? (
        <>
          {!tableOnly ? (
            <AtlasExplorer
              items={filtered}
              locale={locale}
              tileUrl={tileUrl}
              attribution={attribution}
              lite={lite}
              {...(initialNode ? { initialNode } : {})}
            />
          ) : null}
          <section className="press-section">
            <div>
              <p className="section-number">{tableOnly ? "01" : "02"}</p>
              <h2>
                {fr ? "Toutes les entrées de l’Atlas" : "All Atlas entries"}
              </h2>
            </div>
            <div>
              {result.translation.stale && fr ? (
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
          {!tableOnly ? (
            <TwoLedgers
              items={result.items}
              locale={locale}
              initialView={ledger}
            />
          ) : null}
        </>
      ) : (
        <p className="register-state">
          {fr
            ? "L’Atlas est temporairement indisponible."
            : "The Atlas is temporarily unavailable."}
        </p>
      )}
    </main>
  );
}
