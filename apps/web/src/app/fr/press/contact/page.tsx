import type { Metadata } from "next";
import { MediaEnquiryForm } from "../../../../components/content/media-enquiry-form";
import { publicMetadata } from "../../../../lib/discoverability/metadata";
export const metadata: Metadata = publicMetadata({
  title: "Contact presse",
  description: "Envoyer une demande urgente au contact presse désigné.",
  canonical: "/fr/press/contact",
  languages: {
    "en-GB": "/press/contact",
    "fr-FR": "/fr/press/contact",
    "x-default": "/press/contact",
  },
  locale: "fr-FR",
  indexable: true,
});
export default function MediaContactPage() {
  return (
    <main id="main-content" tabIndex={-1} className="site-frame press-room">
      <header className="press-hero">
        <p className="page-kicker">Salle de presse</p>
        <h1>Contact presse</h1>
        <p>
          Envoyez une demande urgente directement au contact presse désigné.
        </p>
      </header>
      <section className="press-section">
        <div>
          <p className="section-number">01</p>
          <h2>Détails de la demande</h2>
        </div>
        <MediaEnquiryForm locale="fr-FR" />
      </section>
    </main>
  );
}
