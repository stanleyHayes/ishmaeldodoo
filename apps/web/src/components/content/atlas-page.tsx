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
            ? "Vingt-cinq années, lisibles dans le temps et l’espace."
            : "Twenty-five years made legible across time and place."}
        </p>
        {!tableOnly ? (
          <a href={`${base}/table`}>
            {fr ? "Ouvrir uniquement le tableau" : "Open table-only view"}
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
              <h2>{fr ? "Tableau accessible" : "Accessible table"}</h2>
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
            ? "L’Atlas publié n’est pas disponible."
            : "The published Atlas is unavailable."}
        </p>
      )}
    </main>
  );
}
