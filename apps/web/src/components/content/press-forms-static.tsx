import type { SupportedLocale } from "../../lib/i18n/locale";

export function PressKitFormStatic({
  locale,
}: Readonly<{ locale: SupportedLocale }>) {
  const french = locale === "fr-FR";
  return (
    <form className="press-kit-form" action="/api/press-kit" method="post">
      <input type="hidden" name="locale" value={locale} />
      <label>
        {french ? "Votre nom" : "Your name"}
        <input name="requesterName" minLength={2} maxLength={100} required />
      </label>
      <label>
        {french ? "Média" : "Outlet"}
        <input name="outlet" minLength={2} maxLength={160} required />
      </label>
      <label>
        {french ? "Adresse e-mail" : "Email address"}
        <input name="email" type="email" maxLength={254} required />
      </label>
      <fieldset>
        <legend>{french ? "Format" : "Format"}</legend>
        <label>
          <input type="radio" name="format" value="pdf" defaultChecked /> PDF
        </label>
        <label>
          <input type="radio" name="format" value="zip" /> ZIP
        </label>
      </fieldset>
      <button type="submit">
        {french ? "Générer le dossier" : "Generate press kit"}
      </button>
      <p className="form-note">
        {french
          ? "Téléchargement immédiat. Votre demande est enregistrée pour le suivi presse."
          : "Immediate download. Your request is logged for press follow-up."}
      </p>
    </form>
  );
}

export function LivingDossierFormStatic({
  locale,
}: Readonly<{ locale: SupportedLocale }>) {
  const french = locale === "fr-FR";
  return (
    <section
      className="press-section living-dossier"
      aria-labelledby="living-dossier-heading"
    >
      <div>
        <p className="section-number">06</p>
        <h2 id="living-dossier-heading">
          {french ? "Le dossier vivant" : "The Living Dossier"}
        </h2>
        <p>
          {french
            ? "Un document personnalisé, assemblé à partir du registre publié au moment de la demande."
            : "A personalised document assembled from the published record at the moment you request it."}
        </p>
      </div>
      <form
        className="press-kit-form"
        action="/api/living-dossier"
        method="post"
      >
        <input type="hidden" name="locale" value={locale} />
        <label>
          {french ? "Votre nom" : "Your name"}
          <input name="requesterName" minLength={2} maxLength={100} required />
        </label>
        <label>
          {french ? "Organisation" : "Organisation"}
          <input name="organisation" minLength={2} maxLength={160} required />
        </label>
        <label>
          {french ? "Adresse e-mail" : "Email address"}
          <input name="email" type="email" maxLength={254} required />
        </label>
        <label>
          {french ? "Objectif du document" : "Purpose of the document"}
          <textarea
            name="purpose"
            minLength={10}
            maxLength={500}
            rows={4}
            required
          />
        </label>
        <fieldset>
          <legend>{french ? "Version" : "Variant"}</legend>
          <label>
            <input type="radio" name="variant" value="speaker" defaultChecked />{" "}
            {french ? "Dossier d’intervention" : "Speaker Pack"}
          </label>
          <label>
            <input type="radio" name="variant" value="institutional" />{" "}
            {french ? "Dossier institutionnel" : "Institutional Dossier"}
          </label>
          <label>
            <input type="radio" name="variant" value="full" />{" "}
            {french ? "Dossier complet" : "Full Record"}
          </label>
        </fieldset>
        <button type="submit">
          {french ? "Générer le dossier" : "Generate dossier"}
        </button>
        <p className="form-note">
          {french
            ? "Le PDF porte une référence discrète et la demande est enregistrée pendant 180 jours."
            : "The PDF carries a discreet reference and the request receipt is retained for 180 days."}
        </p>
      </form>
    </section>
  );
}
