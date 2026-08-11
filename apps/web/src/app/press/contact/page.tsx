import type { Metadata } from "next";
import { MediaEnquiryForm } from "../../../components/content/media-enquiry-form";
import { publicMetadata } from "../../../lib/discoverability/metadata";
export const metadata: Metadata = publicMetadata({
  title: "Media contact",
  description:
    "Send a deadline-sensitive enquiry to the designated press contact.",
  canonical: "/press/contact",
  languages: {
    "en-GB": "/press/contact",
    "fr-FR": "/fr/press/contact",
    "x-default": "/press/contact",
  },
  locale: "en-GB",
  indexable: true,
});
export default function MediaContactPage() {
  return (
    <main id="main-content" tabIndex={-1} className="site-frame press-room">
      <header className="press-hero">
        <p className="page-kicker">Press Room</p>
        <h1>Media contact</h1>
        <p>
          Send a deadline-sensitive enquiry directly to the designated press
          contact.
        </p>
      </header>
      <section className="press-section">
        <div>
          <p className="section-number">01</p>
          <h2>Enquiry details</h2>
        </div>
        <MediaEnquiryForm locale="en-GB" />
      </section>
    </main>
  );
}
