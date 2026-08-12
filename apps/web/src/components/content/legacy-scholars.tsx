import type { PublicLegacy } from "@amanor/contracts";
import type { SupportedLocale } from "../../lib/i18n/locale";

export function LegacyScholars({
  legacy,
  locale,
}: Readonly<{ legacy: PublicLegacy; locale: SupportedLocale }>) {
  const french = locale === "fr-FR";
  return (
    <section className="legacy-register" aria-labelledby="legacy-heading">
      <div className="register-heading">
        <div>
          <p className="page-kicker">
            {french
              ? "Histoires publiées avec consentement"
              : "Consent-cleared published stories"}
          </p>
          <h2 id="legacy-heading">
            {french ? "Parcours des chercheurs" : "Scholar journeys"}
          </h2>
        </div>
        <p>
          {legacy.scholars.length}{" "}
          {french ? "profils publiés" : "published profiles"}
        </p>
      </div>
      {french && legacy.translation.stale ? (
        <p className="translation-notice" role="status">
          Traduction en cours de révision.
        </p>
      ) : null}
      <p className="register-state">
        {french
          ? "Ce registre présente uniquement les profils publiés avec un consentement versionné. Il ne constitue pas un rapport d’impact financier."
          : "This register shows only profiles published under versioned consent. It is not a financial impact report."}
      </p>
      {legacy.scholars.length === 0 ? (
        <p className="register-state">
          {french
            ? "Aucun parcours approuvé n’est publié."
            : "No approved scholar journeys are published."}
        </p>
      ) : (
        <ol className="legacy-list">
          {legacy.scholars.map((scholar) => (
            <li key={scholar.documentId} className="legacy-card">
              <p className="page-kicker">
                {scholar.country} · {scholar.cohortYear}
              </p>
              <h3>{scholar.name}</h3>
              <p>
                <strong>{scholar.field}</strong> · {scholar.institution}
              </p>
              <p>{scholar.story}</p>
              <p className="signal-review">
                {french ? "Statut du programme" : "Programme status"}:{" "}
                {scholar.status}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
