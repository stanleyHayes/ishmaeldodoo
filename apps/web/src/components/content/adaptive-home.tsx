import {
  resolveDateRangedRecord,
  type PublicAtlasNode,
  type PublicSignal,
} from "@amanor/contracts";
import Link from "next/link";
import {
  adaptiveOrder,
  atlasQuery,
  audienceCta,
  audienceDestination,
  audienceDestinations,
  type AdaptiveBlock,
  type AudienceKey,
} from "../../lib/audience/adaptive-dossier";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import type { Identity } from "../../lib/content/identity-payload";
import { AudienceDoors } from "./audience-doors";
import { AudienceDoorsStatic } from "./audience-doors-static";
import { FoundationHero } from "./foundation-hero";
import { TwoLedgers } from "./two-ledgers";

function currentIdentity(identity: Identity) {
  const current = resolveDateRangedRecord(identity.titleHistory);
  return {
    name: identity.displayName,
    ...(current ? { title: `${current.title} · ${current.organisation}` } : {}),
    positioning: identity.bio40,
  };
}

const actOrder = ["forest", "system", "bridge", "architecture"] as const;

function homepageProofs(
  atlas: readonly PublicAtlasNode[],
  audience: AudienceKey | null,
) {
  const proofs = atlas
    .filter(
      (
        item,
      ): item is PublicAtlasNode & {
        homepageProof: NonNullable<PublicAtlasNode["homepageProof"]>;
      } => Boolean(item.homepageProof),
    )
    .sort((left, right) => {
      const leftPriority =
        audience && left.homepageProof.emphasisFor?.includes(audience) ? 0 : 1;
      const rightPriority =
        audience && right.homepageProof.emphasisFor?.includes(audience) ? 0 : 1;
      return (
        leftPriority - rightPriority ||
        left.homepageProof.order - right.homepageProof.order
      );
    });
  return proofs.length === 9 &&
    new Set(proofs.map((item) => item.homepageProof.order)).size === 9
    ? proofs
    : [];
}

function homepageActs(atlas: readonly PublicAtlasNode[]) {
  const acts = atlas.filter(
    (
      item,
    ): item is PublicAtlasNode & {
      homepageAct: NonNullable<PublicAtlasNode["homepageAct"]>;
    } => Boolean(item.homepageAct),
  );
  return acts.length === 4 &&
    new Set(acts.map((item) => item.homepageAct.act)).size === 4
    ? [...acts].sort(
        (left, right) =>
          actOrder.indexOf(left.homepageAct.act) -
          actOrder.indexOf(right.homepageAct.act),
      )
    : [];
}

export function AdaptiveHome({
  locale,
  audience,
  atlas,
  identity,
  signal,
  lite = false,
}: Readonly<{
  locale: SupportedLocale;
  audience: AudienceKey | null;
  atlas: readonly PublicAtlasNode[];
  identity: Identity | null;
  signal: PublicSignal | null;
  lite?: boolean;
}>) {
  const french = locale === "fr-FR";
  const proofs = homepageProofs(atlas, audience);
  const acts = homepageActs(atlas);
  const currentAct = acts.find(
    (item) => item.homepageAct.act === "architecture",
  );
  const signalWords = signal?.body.trim().split(/\s+/u).filter(Boolean) ?? [];
  const signalBody =
    signalWords.length > 200
      ? `${signalWords.slice(0, 200).join(" ")}…`
      : signal?.body;
  const blockContent: Readonly<Record<AdaptiveBlock, React.ReactNode>> = {
    record: acts.length ? (
      <section className="home-record" aria-labelledby="home-record-heading">
        <div className="home-section-heading">
          <p className="section-number">03</p>
          <h2 id="home-record-heading">
            {french
              ? "Un parcours en quatre chapitres"
              : "A career in four chapters"}
          </h2>
        </div>
        <div className="home-act-grid">
          {acts.map((item, index) => (
            <article key={item.homepageAct.act}>
              <figure
                className={`home-act-grid__image home-act-grid__image--${index + 1}`}
              >
                <div>
                  <svg viewBox="0 0 180 180" aria-hidden="true">
                    <circle cx="90" cy="90" r="62" />
                    <circle cx="90" cy="90" r="35" />
                    <path d="M18 90h144M90 18v144" />
                  </svg>
                </div>
                <figcaption>
                  {french
                    ? "Scène éditoriale illustrative · non documentaire"
                    : "Illustrative editorial scene · not documentary evidence"}
                </figcaption>
              </figure>
              <div className="home-act-grid__index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="home-act-grid__period">
                <p>{item.homepageAct.dateRange}</p>
                <p>{item.homepageAct.place}</p>
              </div>
              <div className="home-act-grid__story">
                <h3>{item.homepageAct.label}</h3>
                <p>{item.homepageAct.sentence}</p>
              </div>
              <div className="home-act-grid__evidence">
                <strong>{item.homepageAct.figure}</strong>
                <div className="home-evidence-links">
                  <Link
                    href={`${localizePath("/record/atlas", locale)}?node=${encodeURIComponent(item.slug)}`}
                  >
                    {french ? "Voir dans l’Atlas" : "View in the Atlas"}
                  </Link>
                  {item.sourceRefs.map((ref) => (
                    <Link
                      key={ref}
                      href={`${localizePath("/record/sources", locale)}#${ref}`}
                    >
                      {ref}
                    </Link>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
        <TwoLedgers
          items={atlas}
          locale={locale}
          initialView={audience === "investor" ? "operator" : "diplomatic"}
        />
      </section>
    ) : null,
    atlas: atlas.length ? (
      <section
        className="home-atlas-preview"
        aria-labelledby="atlas-preview-heading"
      >
        <p className="section-number">04</p>
        <div className="home-atlas-preview__copy">
          <p className="page-kicker">
            {french
              ? "Lieux, fonctions et résultats"
              : "Places, roles and results"}
          </p>
          <h2 id="atlas-preview-heading">
            {french
              ? "Explorer le parcours sur la carte"
              : "Explore the career on the map"}
          </h2>
          <p>
            {french
              ? `${atlas.length} étapes publiées. Ouvrez un lieu pour voir la fonction, les résultats et les sources.`
              : `${atlas.length} published entries. Open a place to see the role, results and sources.`}
          </p>
          <Link
            href={`${localizePath("/record/atlas", locale)}${atlasQuery(audience)}`}
          >
            {french ? "Explorer l’Atlas" : "Explore the Atlas"}
          </Link>
        </div>
        <div className="home-atlas-preview__figure" aria-hidden="true">
          <div className="home-atlas-preview__image" />
          <strong>{String(atlas.length).padStart(2, "0")}</strong>
          <span>{french ? "entrées publiées" : "published entries"}</span>
          <svg viewBox="0 0 480 280" role="presentation">
            <path
              className="home-atlas-preview__watermark"
              d="M240 18 426 126 426 236 240 262 54 236 54 126Z"
            />
            <path d="M12 218C72 174 96 222 146 173S232 75 286 116s78 96 182 18" />
            <path d="M32 246c54-24 91-6 124-50s57-93 116-72 66 82 170 66" />
            <path d="M72 78c44 38 67-18 108 9s52 62 96 38 83-70 152-46" />
            <circle cx="146" cy="173" r="7" />
            <circle cx="286" cy="116" r="7" />
            <circle cx="428" cy="79" r="7" />
            <line x1="18" y1="258" x2="462" y2="258" />
          </svg>
        </div>
      </section>
    ) : null,
    current: identity ? (
      <section
        className="home-current-position"
        aria-labelledby="current-position-heading"
      >
        <p className="section-number">05</p>
        <div className="home-current-position__content">
          <header className="home-current-position__header">
            <p className="page-kicker">
              {french ? "Aujourd’hui" : "Where the work stands"}
            </p>
            <h2 id="current-position-heading">
              {french ? "Position actuelle" : "Current position"}
            </h2>
            <p className="home-current-position__role">
              {currentIdentity(identity)?.title}
            </p>
          </header>
          {currentAct ? (
            <div className="home-current-position__body">
              <p>{currentAct.homepageAct.sentence}</p>
              <aside className="home-current-position__figure">
                <span>
                  {french ? "Ambition publiée" : "Published ambition"}
                </span>
                <strong>{currentAct.homepageAct.figure}</strong>
              </aside>
            </div>
          ) : null}
          <footer className="home-current-position__footer">
            <p className="independence-note">
              {french
                ? "Ce site personnel est indépendant et ne représente aucun site officiel de l’État."
                : "This independent personal site is not an official government website."}
            </p>
            <Link href={localizePath("/speaking", locale)}>
              {french
                ? "Voir les thèmes d’intervention"
                : "View speaking themes"}
              <span aria-hidden="true">↗</span>
            </Link>
          </footer>
        </div>
      </section>
    ) : null,
    signal: signal ? (
      <section className="home-signal" aria-labelledby="home-signal-heading">
        <p className="section-number">06</p>
        <article className="home-signal__article">
          <header className="home-signal__header">
            <p className="page-kicker">
              {french ? "Dernière analyse publiée" : "Latest published insight"}
            </p>
            <h2 id="home-signal-heading">{signal.tags.join(" · ")}</h2>
          </header>
          {french && signal.translation.stale ? (
            <p className="translation-notice" role="status">
              Traduction en cours de révision. Texte source mis à jour le{" "}
              {signal.translation.sourceUpdatedAt
                ? signal.translation.sourceUpdatedAt.toLocaleDateString(
                    "fr-FR",
                    { timeZone: "UTC" },
                  )
                : "date non disponible"}
              .
            </p>
          ) : null}
          <p className="home-signal__excerpt">{signalBody}</p>
          <footer className="home-signal__footer">
            {signal.sourceRefs.map((ref) => (
              <Link
                key={ref}
                href={`${localizePath("/record/sources", locale)}#${ref}`}
              >
                {ref}
              </Link>
            ))}
            <Link href={localizePath(`/signals#${signal.slug}`, locale)}>
              {french ? "Lire toutes les analyses" : "Read all insights"}
              <span aria-hidden="true">↗</span>
            </Link>
          </footer>
        </article>
      </section>
    ) : null,
    invitation: (
      <section className="home-invitation" aria-labelledby="invitation-heading">
        <p className="section-number">07</p>
        <div>
          <p className="page-kicker">
            {french
              ? "Ce que vous pouvez faire ensuite"
              : "What you can do next"}
          </p>
          <h2 id="invitation-heading">
            {french
              ? "Poursuivre la conversation"
              : "Continue the conversation"}
          </h2>
          <Link href={localizePath(audienceCta(audience), locale)}>
            <span>{french ? "Voir les possibilités" : "See your options"}</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    ),
  };

  const renderedBlocks = (
    Object.keys(blockContent) as readonly AdaptiveBlock[]
  ).filter((block) => Boolean(blockContent[block]));
  const doorDestinations = audienceDestinations(renderedBlocks);
  const resetDestination = audienceDestination(null, renderedBlocks);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="site-frame foundation-page"
    >
      <FoundationHero
        locale={locale}
        {...(identity ? { identity: currentIdentity(identity) } : {})}
      />
      {proofs.length ? (
        <section
          className="home-proof-strip"
          aria-label={french ? "Neuf preuves" : "Nine proof points"}
        >
          <header className="home-proof-strip__header">
            <p>{french ? "Le dossier de preuves" : "The evidence file"}</p>
            <h2>
              {french
                ? "Neuf preuves. Un seul parcours."
                : "Nine proofs. One record."}
            </h2>
            <p>
              {french
                ? "Neuf faits vérifiables tirés du même parcours. Ouvrez chaque élément dans l’Atlas pour voir le lieu, la période, le résultat et ses sources."
                : "Nine verifiable facts from one career. Open any entry in the Atlas to see its place, period, outcome and sources."}
            </p>
          </header>
          <div className="home-proof-strip__register">
            <Link
              className="home-proof-strip__feature"
              href={`${localizePath("/record/atlas", locale)}?node=${encodeURIComponent(proofs[0]!.slug)}`}
            >
              <span>
                {String(proofs[0]!.homepageProof.order).padStart(2, "0")}
              </span>
              <strong>{proofs[0]!.homepageProof.label}</strong>
              <small>
                {french
                  ? "Ouvrir la preuve dans l’Atlas"
                  : "Open the evidence in the Atlas"}{" "}
                <span aria-hidden="true">↗</span>
              </small>
            </Link>
            <ol>
              {proofs.slice(1).map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`${localizePath("/record/atlas", locale)}?node=${encodeURIComponent(item.slug)}`}
                  >
                    <span>
                      {String(item.homepageProof.order).padStart(2, "0")}
                    </span>
                    <strong>{item.homepageProof.label}</strong>
                    <small aria-hidden="true">↗</small>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}
      {lite ? (
        <AudienceDoorsStatic
          locale={locale}
          selected={audience}
          destinations={doorDestinations}
          resetDestination={resetDestination}
        />
      ) : (
        <AudienceDoors
          locale={locale}
          selected={audience}
          destinations={doorDestinations}
          resetDestination={resetDestination}
        />
      )}
      <div
        className="adaptive-home-blocks"
        data-audience={audience ?? "general"}
      >
        {adaptiveOrder(audience).map((block) =>
          blockContent[block] ? (
            <div key={block} data-adaptive-block={block}>
              {blockContent[block]}
            </div>
          ) : null,
        )}
      </div>
    </main>
  );
}
