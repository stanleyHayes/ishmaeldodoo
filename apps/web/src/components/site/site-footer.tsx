import Link from "next/link";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";
import { AmanorMark } from "./amanor-mark";

export function SiteFooter({
  locale = "en-GB",
  displayName,
}: Readonly<{ locale?: SupportedLocale; displayName?: string }>) {
  const isFrench = locale === "fr-FR";
  const resolvedName = displayName?.trim();
  return (
    <footer className="site-footer">
      <div className="site-frame site-footer__inner">
        <div className="site-footer__folio" aria-hidden="true">
          <span>{isFrench ? "FIN DU DOSSIER" : "END OF RECORD"}</span>
          <span>ACCRA · GMT</span>
        </div>
        <div className="site-footer__masthead">
          <AmanorMark className="site-footer__mark" />
          <p className="site-footer__kicker">
            {isFrench
              ? "Un dossier public indépendant"
              : "An independent public record"}
          </p>
          <p className="site-footer__name">
            <span>Project</span>
            <span>AMANOR</span>
          </p>
          <p className="site-footer__summary">
            {isFrench
              ? "Leadership, institutions et développement — documentés avec des sources."
              : "Leadership, institutions and development — documented with sources."}
          </p>
        </div>

        <div className="site-footer__directory">
          <nav
            className="site-footer__links"
            aria-label={
              isFrench ? "Navigation principale" : "Primary navigation"
            }
          >
            <p>{isFrench ? "Explorer" : "Explore"}</p>
            <Link href={localizePath("/record", locale)}>
              {isFrench ? "Le parcours" : "The Record"}
            </Link>
            <Link href={localizePath("/speaking", locale)}>
              {isFrench ? "Interventions" : "Speaking"}
            </Link>
            <Link href={localizePath("/signals", locale)}>
              {isFrench ? "Signaux" : "Signals"}
            </Link>
            <Link href={localizePath("/press", locale)}>
              {isFrench ? "Presse" : "Press"}
            </Link>
          </nav>
          <nav
            className="site-footer__links"
            aria-label={
              isFrench ? "Informations juridiques" : "Legal navigation"
            }
          >
            <p>{isFrench ? "Transparence" : "Transparency"}</p>
            <Link href={localizePath("/record/sources", locale)}>
              {isFrench ? "Sources" : "Sources"}
            </Link>
            <Link href={localizePath("/legal/privacy", locale)}>
              {isFrench ? "Confidentialité" : "Privacy"}
            </Link>
            <Link href={localizePath("/legal/terms", locale)}>
              {isFrench ? "Conditions" : "Terms"}
            </Link>
            <Link href={localizePath("/legal/disclosure", locale)}>
              {isFrench ? "Déclaration" : "Disclosure"}
            </Link>
          </nav>
        </div>

        <Link
          className="site-footer__contact-cta"
          href={localizePath("/contact", locale)}
        >
          <span>
            {isFrench ? "Poursuivre l’échange" : "Continue the conversation"}
          </span>
          <span aria-hidden="true">↗</span>
        </Link>

        <div className="site-footer__disclosure-block">
          <p className="site-footer__disclosure">
            {isFrench
              ? resolvedName
                ? `Ce site est le site personnel de ${resolvedName}. Il ne constitue pas une publication officielle de l’Autorité de l’Économie 24 Heures et du Développement Accéléré des Exportations, de la Présidence de la République, ni du Gouvernement du Ghana. Les opinions qui y sont exprimées lui sont propres.`
                : "Cette plateforme personnelle est indépendante. Elle ne constitue pas une publication officielle de l’Autorité de l’Économie 24 Heures et du Développement Accéléré des Exportations, de la Présidence de la République, ni du Gouvernement du Ghana."
              : resolvedName
                ? `This is the personal website of ${resolvedName}. It is not an official publication of the 24-Hour Economy and Accelerated Export Development Authority, the Office of the President, or the Government of Ghana. Views expressed here are his own.`
                : "This independent personal platform is not an official publication of the 24-Hour Economy and Accelerated Export Development Authority, the Office of the President, or the Government of Ghana."}
          </p>
          <div className="site-footer__base">
            <p className="site-footer__hours">
              {isFrench
                ? "Ce site vit à l’heure d’Accra."
                : "This site keeps Accra hours."}
            </p>
            <Link href={localizePath("/contact", locale)}>
              {isFrench ? "Prendre contact" : "Get in touch"}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
