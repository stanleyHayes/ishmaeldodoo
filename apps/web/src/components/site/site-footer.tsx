import Link from "next/link";
import { localizePath, type SupportedLocale } from "../../lib/i18n/locale";

export function SiteFooter({
  locale = "en-GB",
}: Readonly<{ locale?: SupportedLocale }>) {
  const isFrench = locale === "fr-FR";
  return (
    <footer className="site-footer">
      <div className="site-frame site-footer__grid">
        <div>
          <p className="site-footer__name">Project AMANOR</p>
          <p className="site-footer__disclosure">
            {isFrench
              ? "Cette plateforme personnelle est indépendante et ne constitue pas un site officiel du gouvernement."
              : "This is an independent personal platform and not an official government website."}
          </p>
          <p className="site-footer__hours">
            {isFrench
              ? "Ce site vit à l’heure d’Accra."
              : "This site keeps Accra hours."}
          </p>
        </div>
        <nav className="site-footer__links" aria-label="Legal navigation">
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
    </footer>
  );
}
