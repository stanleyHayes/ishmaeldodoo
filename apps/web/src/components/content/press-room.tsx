import { resolveDateRangedRecord } from "@amanor/contracts";
import Link from "next/link";
import type { PublicContentResult } from "../../lib/content/public-content-client";
import type { PublicMediaResult } from "../../lib/content/public-media-client";
import { identityPayload } from "../../lib/content/identity-payload";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import { CopyField } from "./copy-field";
import { PressKitForm } from "./press-kit-form";
import { LiteAudio, LiteImage } from "./lite-media";
import { LivingDossierForm } from "./living-dossier-form";
import {
  LivingDossierFormStatic,
  PressKitFormStatic,
} from "./press-forms-static";

function PressCopyField({
  label,
  value,
  locale,
  lite,
}: Readonly<{
  label: string;
  value: string;
  locale: SupportedLocale;
  lite: boolean;
}>) {
  return lite ? (
    <div className="copy-field">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  ) : (
    <CopyField label={label} value={value} locale={locale} />
  );
}

export function PressRoom({
  result,
  portraits,
  locale,
  lite = false,
}: Readonly<{
  result: PublicContentResult;
  portraits: readonly PublicMediaResult[];
  locale: SupportedLocale;
  lite?: boolean;
}>) {
  const french = locale === "fr-FR";
  const identity =
    result.status === "available"
      ? identityPayload(result.content.payload)
      : null;
  if (!identity)
    return (
      <main id="main-content" tabIndex={-1} className="site-frame press-room">
        <p className="page-kicker">
          {french ? "Identité vérifiée" : "Verified identity"}
        </p>
        <h1>
          {french
            ? "Le dossier de presse attend son registre approuvé."
            : "The Press Room is awaiting its approved identity record."}
        </h1>
      </main>
    );
  const currentTitle = resolveDateRangedRecord(identity.titleHistory);
  const pronunciationAudio = identity.pronunciationAudio
    ? portraits.find(
        (asset) =>
          asset.status === "available" &&
          asset.asset.assetId === identity.pronunciationAudio,
      )
    : undefined;
  return (
    <main id="main-content" tabIndex={-1} className="site-frame press-room">
      {french &&
      result.status === "available" &&
      result.content.translation.stale ? (
        <p className="translation-notice" role="status">
          Traduction en cours de révision. Texte source mis à jour le{" "}
          {result.content.translation.sourceUpdatedAt?.toLocaleDateString(
            "fr-FR",
            { timeZone: "UTC" },
          ) ?? "date non disponible"}
          .
        </p>
      ) : null}
      <header className="press-hero">
        <p className="page-kicker">
          {french ? "Salle de presse" : "Press Room"}
        </p>
        <h1>{identity.displayName}</h1>
        <p>
          {currentTitle?.title} · {currentTitle?.organisation}
        </p>
      </header>
      <section className="press-section" aria-labelledby="identity-heading">
        <div>
          <p className="section-number">01</p>
          <h2 id="identity-heading">
            {french ? "Identité canonique" : "Canonical identity"}
          </h2>
        </div>
        <div className="copy-stack">
          <PressCopyField
            label={french ? "Nom légal" : "Legal name"}
            value={identity.legalName}
            locale={locale}
            lite={lite}
          />
          <PressCopyField
            label={french ? "Titre honorifique" : "Honorific"}
            value={identity.honorific}
            locale={locale}
            lite={lite}
          />
          <PressCopyField
            label={french ? "Nom d’affichage" : "Display name"}
            value={identity.displayName}
            locale={locale}
            lite={lite}
          />
          <PressCopyField
            label={french ? "Nom court" : "Short name"}
            value={identity.shortName}
            locale={locale}
            lite={lite}
          />
          <PressCopyField
            label={
              french
                ? "Titre et organisation actuels"
                : "Current title and organisation"
            }
            value={`${currentTitle?.title ?? ""}${currentTitle?.organisation ? `, ${currentTitle.organisation}` : ""}`}
            locale={locale}
            lite={lite}
          />
          <div className="pronunciation">
            <span>{french ? "Prononciation" : "Pronunciation"}</span>
            <p>{identity.pronunciationGuide}</p>
            {pronunciationAudio?.status === "available" ? (
              lite ? (
                <div className="lite-audio-placeholder">
                  <p>{identity.pronunciationGuide}</p>
                  <a href={pronunciationAudio.asset.secureUrl}>
                    {french ? "Charger l’audio" : "Load audio"}
                  </a>
                </div>
              ) : (
                <LiteAudio
                  src={pronunciationAudio.asset.secureUrl}
                  transcript={identity.pronunciationGuide}
                  locale={locale}
                  lite={false}
                />
              )
            ) : null}
          </div>
        </div>
      </section>
      <section className="press-section" aria-labelledby="bios-heading">
        <div>
          <p className="section-number">02</p>
          <h2 id="bios-heading">
            {french ? "Biographies approuvées" : "Approved biographies"}
          </h2>
        </div>
        <div className="bio-stack">
          {(
            [
              ["40", identity.bio40],
              ["120", identity.bio120],
              ["300", identity.bio300],
            ] satisfies ReadonlyArray<readonly [string, string]>
          ).map(([length, biography]) => (
            <article key={length}>
              <h3>
                {length} {french ? "mots" : "words"}
              </h3>
              <p>{biography}</p>
              <PressCopyField
                label={`${length} ${french ? "mots" : "words"}`}
                value={biography}
                locale={locale}
                lite={lite}
              />
            </article>
          ))}
        </div>
      </section>
      <section className="press-section" aria-labelledby="history-heading">
        <div>
          <p className="section-number">03</p>
          <h2 id="history-heading">
            {french ? "Historique des titres" : "Title history"}
          </h2>
        </div>
        <ol className="title-history">
          {identity.titleHistory.map((entry) => (
            <li key={`${entry.sourceRef}-${String(entry.from)}`}>
              <div>
                <time>{new Date(entry.from).getUTCFullYear()}</time>
                <span>–</span>
                <time>
                  {entry.to
                    ? new Date(entry.to).getUTCFullYear()
                    : french
                      ? "présent"
                      : "present"}
                </time>
              </div>
              <h3>{entry.title}</h3>
              <p>{entry.longFormTitle}</p>
              <p>{entry.organisation}</p>
              <Link
                href={`${localizePath("/record/sources", locale)}#${entry.sourceRef}`}
              >
                {entry.sourceRef}
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <section className="press-section" aria-labelledby="portraits-heading">
        <div>
          <p className="section-number">04</p>
          <h2 id="portraits-heading">
            {french ? "Portraits approuvés" : "Approved portraits"}
          </h2>
        </div>
        <div className="portrait-grid">
          {portraits
            .filter(
              (portrait) =>
                portrait.status === "available" &&
                portrait.asset.resourceType === "image",
            )
            .map((portrait) =>
              portrait.status === "available" ? (
                <figure
                  key={portrait.asset.assetId}
                  style={
                    portrait.asset.focalPoint
                      ? ({
                          "--media-focal": `${portrait.asset.focalPoint.x * 100}% ${portrait.asset.focalPoint.y * 100}%`,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  {lite ? (
                    <div className="lite-media-placeholder">
                      <p>{portrait.asset.altText}</p>
                      <a href={portrait.asset.secureUrl}>
                        {french ? "Charger l’image" : "Load image"}
                      </a>
                    </div>
                  ) : (
                    <LiteImage
                      src={portrait.asset.secureUrl}
                      alt={portrait.asset.altText}
                      width={portrait.asset.width ?? 1200}
                      height={portrait.asset.height ?? 1500}
                      locale={locale}
                      lite={false}
                    />
                  )}
                  <figcaption>
                    {portrait.asset.credit} · {portrait.asset.licence}
                    <br />
                    <a href={portrait.asset.secureUrl} download>
                      {french ? "Télécharger" : "Download"}
                    </a>
                  </figcaption>
                </figure>
              ) : null,
            )}
          {portraits.every(
            (portrait) =>
              portrait.status !== "available" ||
              portrait.asset.resourceType !== "image",
          ) ? (
            <p className="register-state">
              {french
                ? "Aucun portrait approuvé n’est actuellement disponible."
                : "No approved portraits are currently available."}
            </p>
          ) : null}
        </div>
      </section>
      <section className="press-section" aria-labelledby="kit-heading">
        <div>
          <p className="section-number">05</p>
          <h2 id="kit-heading">{french ? "Dossier de presse" : "Press kit"}</h2>
        </div>
        <div>
          <p>
            {french
              ? "Créez un dossier à jour, personnalisé pour votre média."
              : "Create an up-to-date pack personalised for your outlet."}
          </p>
          {lite ? (
            <PressKitFormStatic locale={locale} />
          ) : (
            <PressKitForm locale={locale} />
          )}
        </div>
      </section>
      {lite ? (
        <LivingDossierFormStatic locale={locale} />
      ) : (
        <LivingDossierForm locale={locale} />
      )}
      <section
        className="press-section"
        aria-labelledby="media-contact-heading"
      >
        <div>
          <p className="section-number">07</p>
          <h2 id="media-contact-heading">
            {french ? "Contact presse" : "Media contact"}
          </h2>
        </div>
        <div>
          <p>
            {french
              ? "Pour une demande éditoriale urgente, contactez directement le point de contact presse désigné."
              : "For a deadline-sensitive editorial enquiry, reach the designated press contact directly."}
          </p>
          <Link href={localizePath("/press/contact", locale)}>
            {french ? "Envoyer une demande presse" : "Send a media enquiry"}
          </Link>
        </div>
      </section>
      {identity.disambiguation ? (
        <section
          className="press-section"
          aria-labelledby="disambiguation-heading"
        >
          <div>
            <p className="section-number">08</p>
            <h2 id="disambiguation-heading">
              {french ? "À ne pas confondre" : "Not to be confused"}
            </h2>
          </div>
          <p>{identity.disambiguation}</p>
        </section>
      ) : null}
    </main>
  );
}

export function identityAssetIds(
  result: PublicContentResult,
): readonly string[] {
  const identity =
    result.status === "available"
      ? identityPayload(result.content.payload)
      : null;
  return identity
    ? [
        ...identity.portraits.slice(0, 3),
        ...(identity.pronunciationAudio ? [identity.pronunciationAudio] : []),
      ]
    : [];
}
