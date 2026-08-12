import type { PublicSignals } from "@amanor/contracts";
import Link from "next/link";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";

const confidenceLabels = {
  watching: { "en-GB": "Watching", "fr-FR": "À surveiller" },
  expecting: { "en-GB": "Expecting", "fr-FR": "Attendu" },
  callingIt: { "en-GB": "Calling it", "fr-FR": "Conviction" },
} as const;
const resolutionLabels = {
  heldUp: { "en-GB": "Held up", "fr-FR": "Confirmé" },
  partly: { "en-GB": "Partly", "fr-FR": "Partiellement" },
  didNot: { "en-GB": "Did not", "fr-FR": "Non réalisé" },
  tooEarly: { "en-GB": "Too early", "fr-FR": "Trop tôt" },
} as const;

export function SignalBoard({
  signals,
  locale,
}: Readonly<{ signals: PublicSignals; locale: SupportedLocale }>) {
  const french = locale === "fr-FR";
  const foresight = signals.items.filter(
    (signal) => signal.confidence !== "watching",
  );
  return (
    <section className="signal-board" aria-labelledby="signal-board-heading">
      <div className="register-heading">
        <div>
          <p className="page-kicker">
            {french ? "Registre publié" : "Published register"}
          </p>
          <h2 id="signal-board-heading">
            {french ? "Tableau des signaux" : "Signal Board"}
          </h2>
        </div>
        <p>
          {signals.items.length} {french ? "signaux" : "signals"} ·{" "}
          {foresight.length}{" "}
          {french ? "dans le registre prospectif" : "in the Foresight Ledger"}
        </p>
      </div>
      {french && signals.translation.stale ? (
        <p className="translation-notice" role="status">
          Traduction en cours de révision.
        </p>
      ) : null}
      {signals.items.length === 0 ? (
        <p className="register-state">
          {french
            ? "Aucun signal approuvé n’est encore publié."
            : "No approved Signals are published yet."}
        </p>
      ) : (
        <ol className="signal-list">
          {signals.items.map((signal) => (
            <li
              id={signal.slug}
              key={signal.documentId}
              className="signal-card"
            >
              <header>
                <p className="signal-date">
                  {signal.publishedAt.toLocaleDateString(locale, {
                    dateStyle: "long",
                    timeZone: "UTC",
                  })}
                </p>
                <span
                  className={`signal-confidence signal-${signal.confidence}`}
                >
                  {confidenceLabels[signal.confidence][locale]}
                </span>
              </header>
              <h3>{signal.tags.join(" · ")}</h3>
              <p>{signal.body}</p>
              <div className="signal-condition">
                <strong>
                  {french
                    ? "Ce qui changerait l’avis"
                    : "What would change the view"}
                </strong>
                <p>{signal.changeMyMind}</p>
              </div>
              {signal.reviewDue ? (
                <p className="signal-review">
                  {french ? "Révision prévue" : "Review due"}:{" "}
                  {signal.reviewDue.toLocaleDateString(locale, {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  })}
                </p>
              ) : null}
              {signal.resolution && signal.resolutionNote ? (
                <aside className="signal-resolution">
                  <strong>{resolutionLabels[signal.resolution][locale]}</strong>
                  <p>{signal.resolutionNote}</p>
                </aside>
              ) : null}
              <p className="source-line">
                {french ? "Sources :" : "Sources:"}{" "}
                {signal.sourceRefs.map((reference, index) => (
                  <span key={reference}>
                    {index > 0 ? ", " : null}
                    <Link
                      href={`${localizePath("/record/sources", locale)}#${reference}`}
                    >
                      {reference}
                    </Link>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
