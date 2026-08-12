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
            {french ? "Le parcours en quatre actes" : "The record in four acts"}
          </h2>
        </div>
        <div className="home-act-grid">
          {acts.map((item) => (
            <article key={item.homepageAct.act}>
              <p>{item.homepageAct.dateRange}</p>
              <h3>{item.homepageAct.label}</h3>
              <p>{item.homepageAct.place}</p>
              <strong>{item.homepageAct.figure}</strong>
              <p>{item.homepageAct.sentence}</p>
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
        <div>
          <h2 id="atlas-preview-heading">
            {french ? "L’Atlas en aperçu" : "The Atlas at a glance"}
          </h2>
          <p>
            {french
              ? `${atlas.length} étapes publiées dans un même parcours vérifiable.`
              : `${atlas.length} published entries in one verifiable record.`}
          </p>
          <Link
            href={`${localizePath("/record/atlas", locale)}${atlasQuery(audience)}`}
          >
            {french ? "Explorer l’Atlas" : "Explore the Atlas"}
          </Link>
        </div>
      </section>
    ) : null,
    current: identity ? (
      <section
        className="home-current-position"
        aria-labelledby="current-position-heading"
      >
        <p className="section-number">05</p>
        <div>
          <h2 id="current-position-heading">
            {french ? "Position actuelle" : "Current position"}
          </h2>
          <p>{currentIdentity(identity)?.title}</p>
          {currentAct ? (
            <>
              <p>{currentAct.homepageAct.sentence}</p>
              <p className="home-current-figure">
                {currentAct.homepageAct.figure}
              </p>
            </>
          ) : null}
          <p className="independence-note">
            {french
              ? "Ce site personnel est indépendant et ne représente aucun site officiel de l’État."
              : "This independent personal site is not an official government website."}
          </p>
          <Link href={localizePath("/speaking", locale)}>
            {french ? "Voir les thèmes d’intervention" : "View speaking themes"}
          </Link>
        </div>
      </section>
    ) : null,
    signal: signal ? (
      <section className="home-signal" aria-labelledby="home-signal-heading">
        <p className="section-number">06</p>
        <div>
          <p className="page-kicker">
            {french ? "Dernier signal" : "Latest signal"}
          </p>
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
          <h2 id="home-signal-heading">{signal.tags.join(" · ")}</h2>
          <p>{signalBody}</p>
          <div className="home-evidence-links">
            {signal.sourceRefs.map((ref) => (
              <Link
                key={ref}
                href={`${localizePath("/record/sources", locale)}#${ref}`}
              >
                {ref}
              </Link>
            ))}
            <Link href={localizePath(`/signals#${signal.slug}`, locale)}>
              {french ? "Ouvrir le tableau" : "Open the Signal Board"}
            </Link>
          </div>
        </div>
      </section>
    ) : null,
    invitation: (
      <section className="home-invitation" aria-labelledby="invitation-heading">
        <p className="section-number">07</p>
        <div>
          <h2 id="invitation-heading">
            {french
              ? "Poursuivre la conversation"
              : "Continue the conversation"}
          </h2>
          <Link href={localizePath(audienceCta(audience), locale)}>
            {french ? "Choisir la prochaine étape" : "Choose the next step"}
          </Link>
        </div>
      </section>
    ),
  };

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
          <ol>
            {proofs.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`${localizePath("/record/atlas", locale)}?node=${encodeURIComponent(item.slug)}`}
                >
                  <span>
                    {String(item.homepageProof.order).padStart(2, "0")}
                  </span>
                  {item.homepageProof.label}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {lite ? (
        <AudienceDoorsStatic locale={locale} selected={audience} />
      ) : (
        <AudienceDoors locale={locale} selected={audience} />
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
