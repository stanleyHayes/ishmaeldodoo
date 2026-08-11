"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { trackAnalyticsEvent } from "../../lib/analytics-client";
import type { SupportedLocale } from "../../lib/i18n/locale";

type Draft = Record<string, string | boolean>;
const initialDraft: Draft = {
  capacity: "",
  organisationType: "",
  format: "",
  language: "",
  engagementType: "",
  travel: "",
  honorarium: "",
  recording: false,
  invitationLetter: false,
  visaLetter: false,
  governmentProtocol: false,
  otherPrincipals: false,
  dataProcessing: false,
  authorityToInvite: false,
};

const copy = {
  "en-GB": {
    eyebrow: "Protocol Desk",
    title: "Request an engagement",
    intro:
      "A six-step intake designed to help the Desk give every invitation a clear answer. No account or file upload is required.",
    steps: [
      "Capacity",
      "Organisation",
      "Engagement",
      "The ask",
      "Logistics",
      "Review",
    ],
    back: "Back",
    next: "Continue",
    submit: "Submit invitation",
    sending: "Submitting…",
    saved: "Progress saved on this device",
    clear: "Clear saved progress",
    restored: "Saved progress restored.",
    error:
      "The request could not be submitted. Check the highlighted fields or try again shortly.",
    reference: "Your request has been received",
    response:
      "The Desk will send a substantive response within 48 hours. Keep this reference for correspondence.",
  },
  "fr-FR": {
    eyebrow: "Bureau du protocole",
    title: "Proposer une intervention",
    intro:
      "Un parcours en six étapes conçu pour permettre au Bureau de répondre clairement à chaque invitation. Aucun compte ni fichier n’est requis.",
    steps: [
      "Qualité",
      "Organisation",
      "Intervention",
      "La demande",
      "Logistique",
      "Vérification",
    ],
    back: "Retour",
    next: "Continuer",
    submit: "Envoyer l’invitation",
    sending: "Envoi…",
    saved: "Progression enregistrée sur cet appareil",
    clear: "Effacer la progression",
    restored: "Progression enregistrée restaurée.",
    error:
      "La demande n’a pas pu être envoyée. Vérifiez les champs signalés ou réessayez sous peu.",
    reference: "Votre demande a bien été reçue",
    response:
      "Le Bureau vous apportera une réponse de fond sous 48 heures. Conservez cette référence.",
  },
} as const;

function text(value: Draft, key: string): string {
  return typeof value[key] === "string" ? value[key] : "";
}
function checked(value: Draft, key: string): boolean {
  return value[key] === true;
}

export function ProtocolDeskForm({
  locale,
}: Readonly<{ locale: SupportedLocale }>) {
  const t = copy[locale];
  const french = locale === "fr-FR";
  const formId = useId();
  const storageKey = `amanor:protocol-desk:${locale}:v1`;
  const stepStorageKey = `${storageKey}:step`;
  const analyticsStartKey = `${storageKey}:analytics-started`;
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "error" | "success">(
    "idle",
  );
  const [reference, setReference] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setDraft({ ...initialDraft, ...(JSON.parse(saved) as Draft) });
        setStep(
          Math.min(
            Math.max(Number(localStorage.getItem(stepStorageKey) ?? 0), 0),
            5,
          ),
        );
        setRestored(true);
      }
    } catch {
      localStorage.removeItem(storageKey);
    } finally {
      setHydrated(true);
    }
  }, [stepStorageKey, storageKey]);

  function update(key: string, value: string | boolean) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "capacity" && value === "official") next.honorarium = "";
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* The form remains usable when storage is unavailable. */
      }
      return next;
    });
    setState("idle");
  }

  function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fieldset = event.currentTarget.querySelector<HTMLElement>(
      `[data-step="${step}"]`,
    );
    const invalid = fieldset?.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(":invalid");
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    if (step === 0 && sessionStorage.getItem(analyticsStartKey) !== "true") {
      sessionStorage.setItem(analyticsStartKey, "true");
      void trackAnalyticsEvent({
        name: "protocol_desk_started",
        route: `${french ? "/fr" : ""}/speaking/request`,
        locale,
      });
    }
    setStep((current) => {
      const next = Math.min(current + 1, 5);
      localStorage.setItem(stepStorageKey, String(next));
      return next;
    });
  }

  async function submit() {
    setState("sending");
    const startsAt = new Date(
      `${text(draft, "eventDate")}T${text(draft, "eventTime") || "09:00"}:00Z`,
    ).toISOString();
    const payload = {
      locale,
      capacity: text(draft, "capacity"),
      ...(text(draft, "capacity") === "unsure"
        ? {
            capacityContext: text(draft, "capacityContext"),
            capacityFunding: text(draft, "capacityFunding"),
          }
        : {}),
      organisation: {
        name: text(draft, "organisationName"),
        type: text(draft, "organisationType"),
        country: text(draft, "organisationCountry"),
        ...(text(draft, "organisationWebsite")
          ? { website: text(draft, "organisationWebsite") }
          : {}),
        ...(text(draft, "convenors")
          ? { convenors: text(draft, "convenors") }
          : {}),
      },
      requester: {
        name: text(draft, "requesterName"),
        role: text(draft, "requesterRole"),
        email: text(draft, "requesterEmail"),
        ...(text(draft, "requesterPhone")
          ? { phone: text(draft, "requesterPhone") }
          : {}),
      },
      engagement: {
        type: text(draft, "engagementType"),
        eventName: text(draft, "eventName"),
        startsAt,
        city: text(draft, "eventCity"),
        country: text(draft, "eventCountry"),
        ...(text(draft, "venue") ? { venue: text(draft, "venue") } : {}),
        format: text(draft, "format"),
        language: text(draft, "language"),
        ...(text(draft, "language") === "english"
          ? {}
          : {
              interpretationProvided: checked(draft, "interpretationProvided"),
            }),
        audienceSize: Number(text(draft, "audienceSize")),
        audienceDescription: text(draft, "audienceDescription"),
        ...(text(draft, "edition") ? { edition: text(draft, "edition") } : {}),
      },
      ask: {
        proposedTheme: text(draft, "proposedTheme"),
        objective: text(draft, "objective"),
        ...(text(draft, "otherSpeakers")
          ? { otherSpeakers: text(draft, "otherSpeakers") }
          : {}),
        recording: checked(draft, "recording"),
        ...(checked(draft, "recording")
          ? {
              transcriptRights: checked(draft, "transcriptRights"),
              republicationRights: checked(draft, "republicationRights"),
            }
          : {}),
      },
      logistics: {
        travel: text(draft, "travel"),
        ...(text(draft, "capacity") === "official" || !text(draft, "honorarium")
          ? {}
          : { honorarium: text(draft, "honorarium") }),
        invitationLetter: checked(draft, "invitationLetter"),
        visaLetter: checked(draft, "visaLetter"),
        governmentProtocol: checked(draft, "governmentProtocol"),
        otherPrincipals: checked(draft, "otherPrincipals"),
        ...(text(draft, "securityConsiderations")
          ? { securityConsiderations: text(draft, "securityConsiderations") }
          : {}),
        contactName: text(draft, "contactName"),
        contactPhone: text(draft, "contactPhone"),
      },
      consent: {
        dataProcessing: checked(draft, "dataProcessing"),
        authorityToInvite: checked(draft, "authorityToInvite"),
        version: "2026-08",
      },
    };
    try {
      const response = await fetch("/api/protocol-desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("submission failed");
      const result = (await response.json()) as { reference?: string };
      if (!result.reference) throw new Error("reference missing");
      localStorage.removeItem(storageKey);
      localStorage.removeItem(stepStorageKey);
      setReference(result.reference);
      setState("success");
      void trackAnalyticsEvent({
        name: "protocol_desk_completed",
        route: `${french ? "/fr" : ""}/speaking/request`,
        locale,
      });
    } catch {
      setState("error");
    }
  }

  if (state === "success")
    return (
      <section
        className="protocol-receipt"
        aria-labelledby={`${formId}-receipt`}
      >
        <p className="page-kicker">{t.eyebrow}</p>
        <h2 id={`${formId}-receipt`}>{t.reference}</h2>
        <strong>{reference}</strong>
        <p>{t.response}</p>
      </section>
    );

  const input = (
    key: string,
    label: string,
    options: Readonly<{
      type?: string;
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      placeholder?: string;
    }> = {},
  ) => (
    <label>
      {label}
      <input
        name={key}
        value={text(draft, key)}
        onChange={(event) => update(key, event.target.value)}
        {...options}
      />
    </label>
  );
  const choice = (key: string, label: string, value: string) => (
    <label className="protocol-choice">
      <input
        type="radio"
        name={key}
        value={value}
        checked={text(draft, key) === value}
        onChange={() => update(key, value)}
        required
      />{" "}
      <span>{label}</span>
    </label>
  );
  const toggle = (key: string, label: string, required = false) => (
    <label className="protocol-check">
      <input
        type="checkbox"
        checked={checked(draft, key)}
        onChange={(event) => update(key, event.target.checked)}
        required={required}
      />{" "}
      <span>{label}</span>
    </label>
  );

  return (
    <section
      className="protocol-desk"
      aria-labelledby={`${formId}-title`}
      data-hydrated={hydrated}
    >
      <header>
        <p className="page-kicker">{t.eyebrow}</p>
        <h2 id={`${formId}-title`}>{t.title}</h2>
        <p>{t.intro}</p>
      </header>
      <ol
        className="protocol-progress"
        aria-label={french ? "Progression" : "Progress"}
      >
        {t.steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            data-complete={index < step}
          >
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <p className="protocol-save" role="status">
        {restored ? t.restored : t.saved}
      </p>
      <form
        onSubmit={
          step < 5
            ? advance
            : (event) => {
                event.preventDefault();
                void submit();
              }
        }
        noValidate={false}
      >
        <fieldset data-step="0" hidden={step !== 0} disabled={step !== 0}>
          <legend>
            {french
              ? "Dans quelle qualité invitez-vous Dr Dodoo\u00a0?"
              : "In what capacity are you inviting Dr Dodoo?"}
          </legend>
          {choice(
            "capacity",
            french
              ? "Dans son rôle officiel à la 24-Hour Economy Authority"
              : "In his official role at the 24-Hour Economy Authority",
            "official",
          )}
          {choice(
            "capacity",
            french
              ? "À titre personnel comme praticien du développement et de la finance"
              : "In his personal capacity as a development and finance practitioner",
            "personal",
          )}
          {choice(
            "capacity",
            french ? "Je ne suis pas certain(e)" : "I am not sure",
            "unsure",
          )}
          {text(draft, "capacity") === "official" ? (
            <aside role="note">
              {french
                ? "Les invitations officielles doivent également être adressées à l’Autorité. Ce Bureau les transmettra, mais ne peut confirmer en son nom. Aucun honoraire ne peut être enregistré ici."
                : "Official invitations must also be addressed to the Authority. This Desk will forward them but cannot confirm on its behalf. No honorarium can be recorded here."}
            </aside>
          ) : null}
          {text(draft, "capacity") === "unsure" ? (
            <>
              {input(
                "capacityContext",
                french
                  ? "Quel rôle ou programme motive cette invitation ?"
                  : "Which role or programme prompted this invitation?",
                { required: true, minLength: 5, maxLength: 300 },
              )}
              {input(
                "capacityFunding",
                french
                  ? "Qui finance ou commande l’intervention ?"
                  : "Who is funding or commissioning the engagement?",
                { required: true, minLength: 2, maxLength: 200 },
              )}
              <aside role="note">
                {french
                  ? "Le Bureau classera la demande de façon prudente et confirmera la qualité avant toute décision. Les signaux liés à une fonction publique déclenchent le canal officiel et suppriment toute discussion d’honoraires."
                  : "The Desk will classify the request conservatively and confirm capacity before any decision. Public-office signals trigger the official channel and suppress all honorarium discussion."}
              </aside>
            </>
          ) : null}
        </fieldset>
        <fieldset data-step="1" hidden={step !== 1} disabled={step !== 1}>
          <legend>
            {french
              ? "L’organisation et votre rôle"
              : "The organisation and your role"}
          </legend>
          {input(
            "organisationName",
            french ? "Nom de l’organisation" : "Organisation name",
            { required: true, minLength: 2, maxLength: 180 },
          )}
          <label>
            {french ? "Type d’organisation" : "Organisation type"}
            <select
              value={text(draft, "organisationType")}
              onChange={(e) => update("organisationType", e.target.value)}
              required
            >
              <option value="">—</option>
              {[
                ["government", french ? "Gouvernement" : "Government"],
                ["multilateral", "Multilateral"],
                ["private_sector", french ? "Secteur privé" : "Private sector"],
                ["academic", french ? "Université" : "Academic"],
                ["civil_society", french ? "Société civile" : "Civil society"],
                ["media", "Media"],
                ["other", french ? "Autre" : "Other"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="protocol-grid">
            {input(
              "organisationCountry",
              french ? "Pays (code à 2 lettres)" : "Country (2-letter code)",
              { required: true, minLength: 2, maxLength: 2 },
            )}
            {input("organisationWebsite", french ? "Site web" : "Website", {
              type: "url",
            })}
          </div>
          {input("requesterName", french ? "Votre nom" : "Your name", {
            required: true,
            minLength: 2,
            maxLength: 120,
          })}
          {input("requesterRole", french ? "Votre fonction" : "Your role", {
            required: true,
            minLength: 2,
            maxLength: 120,
          })}
          <div className="protocol-grid">
            {input(
              "requesterEmail",
              french ? "Adresse e-mail professionnelle" : "Work email",
              { type: "email", required: true, maxLength: 254 },
            )}
            {input("requesterPhone", french ? "Téléphone" : "Phone", {
              type: "tel",
            })}
          </div>
          <label>
            {french
              ? "Coorganisateurs, sponsors ou partenaires"
              : "Co-hosts, sponsors or partners"}
            <textarea
              value={text(draft, "convenors")}
              onChange={(e) => update("convenors", e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </label>
        </fieldset>
        <fieldset data-step="2" hidden={step !== 2} disabled={step !== 2}>
          <legend>{french ? "L’intervention" : "The engagement"}</legend>
          <label>
            {french ? "Type" : "Type"}
            <select
              value={text(draft, "engagementType")}
              onChange={(e) => update("engagementType", e.target.value)}
              required
            >
              <option value="">—</option>
              {[
                ["keynote", french ? "Discours principal" : "Keynote address"],
                ["panel", french ? "Plénière ou panel" : "Plenary or panel"],
                ["fireside", "Fireside conversation"],
                [
                  "institutional_briefing",
                  french
                    ? "Briefing institutionnel fermé"
                    : "Closed-door institutional briefing",
                ],
                [
                  "media_interview",
                  french ? "Entretien média" : "Media interview",
                ],
                [
                  "advisory",
                  french
                    ? "Conseil ou conseil d’administration"
                    : "Advisory or board engagement",
                ],
                [
                  "academic",
                  french ? "Conférence universitaire" : "Academic lecture",
                ],
                ["youth", french ? "Intervention jeunesse" : "Youth address"],
                [
                  "written_contribution",
                  french ? "Contribution écrite" : "Written contribution",
                ],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {input("eventName", french ? "Nom de l’événement" : "Event name", {
            required: true,
            minLength: 2,
            maxLength: 200,
          })}
          <div className="protocol-grid">
            {input("eventDate", french ? "Date de début" : "Start date", {
              type: "date",
              required: true,
            })}
            {input("eventTime", french ? "Heure (UTC)" : "Time (UTC)", {
              type: "time",
            })}
          </div>
          <div className="protocol-grid">
            {input("eventCity", french ? "Ville" : "City", {
              required: true,
              minLength: 2,
              maxLength: 120,
            })}
            {input(
              "eventCountry",
              french ? "Pays (code à 2 lettres)" : "Country (2-letter code)",
              { required: true, minLength: 2, maxLength: 2 },
            )}
          </div>
          {input("venue", french ? "Lieu" : "Venue", { maxLength: 200 })}
          <div className="protocol-grid">
            <label>
              {french ? "Format" : "Format"}
              <select
                value={text(draft, "format")}
                onChange={(e) => update("format", e.target.value)}
                required
              >
                <option value="">—</option>
                <option value="in_person">
                  {french ? "En personne" : "In person"}
                </option>
                <option value="virtual">
                  {french ? "Virtuel" : "Virtual"}
                </option>
                <option value="hybrid">{french ? "Hybride" : "Hybrid"}</option>
              </select>
            </label>
            <label>
              {french ? "Langue" : "Language"}
              <select
                value={text(draft, "language")}
                onChange={(e) => update("language", e.target.value)}
                required
              >
                <option value="">—</option>
                <option value="english">English</option>
                <option value="french">Français</option>
                <option value="both">{french ? "Les deux" : "Both"}</option>
              </select>
            </label>
          </div>
          {text(draft, "language") !== "" &&
          text(draft, "language") !== "english"
            ? toggle(
                "interpretationProvided",
                french
                  ? "Une interprétation sera fournie"
                  : "Interpretation will be provided",
              )
            : null}
          <div className="protocol-grid">
            {input(
              "audienceSize",
              french ? "Taille attendue du public" : "Expected audience size",
              { type: "number", required: true },
            )}
            {input(
              "edition",
              french
                ? "Édition / première ou récurrente"
                : "Edition / first-time or recurring",
              { maxLength: 120 },
            )}
          </div>
          <label>
            {french
              ? "Qui sera dans la salle\u00a0? La séniorité compte plus que le nombre."
              : "Who will be in the room? Seniority matters more than headcount."}
            <textarea
              value={text(draft, "audienceDescription")}
              onChange={(e) => update("audienceDescription", e.target.value)}
              required
              minLength={10}
              maxLength={1500}
              rows={4}
            />
          </label>
        </fieldset>
        <fieldset data-step="3" hidden={step !== 3} disabled={step !== 3}>
          <legend>{french ? "La demande" : "The ask"}</legend>
          {input(
            "proposedTheme",
            french ? "Thème ou titre proposé" : "Proposed theme or title",
            { required: true, minLength: 2, maxLength: 240 },
          )}
          <label>
            {french
              ? "Que doit retenir le public\u00a0? (200 mots maximum)"
              : "What should the audience leave with? (up to 200 words)"}
            <textarea
              value={text(draft, "objective")}
              onChange={(e) => update("objective", e.target.value)}
              required
              minLength={10}
              maxLength={1500}
              rows={6}
            />
          </label>
          <label>
            {french
              ? "Autres intervenants confirmés ou invités"
              : "Other confirmed or invited speakers"}
            <textarea
              value={text(draft, "otherSpeakers")}
              onChange={(e) => update("otherSpeakers", e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </label>
          {toggle(
            "recording",
            french
              ? "La séance sera enregistrée, diffusée ou publiée"
              : "The session will be recorded, broadcast or published",
          )}
          {checked(draft, "recording") ? (
            <div className="protocol-inset">
              {toggle(
                "transcriptRights",
                french ? "Transcription autorisée" : "Transcript permitted",
              )}
              {toggle(
                "republicationRights",
                french ? "Republication autorisée" : "Republication permitted",
              )}
            </div>
          ) : null}
        </fieldset>
        <fieldset data-step="4" hidden={step !== 4} disabled={step !== 4}>
          <legend>
            {french ? "Logistique et protocole" : "Logistics and protocol"}
          </legend>
          <label>
            {french ? "Voyage et hébergement" : "Travel and accommodation"}
            <select
              value={text(draft, "travel")}
              onChange={(e) => update("travel", e.target.value)}
              required
            >
              <option value="">—</option>
              <option value="host_covered">
                {french ? "Pris en charge par l’hôte" : "Covered by host"}
              </option>
              <option value="not_covered">
                {french ? "Non pris en charge" : "Not covered"}
              </option>
              <option value="discuss">
                {french ? "À discuter" : "To be discussed"}
              </option>
            </select>
          </label>
          {text(draft, "capacity") !== "official" ? (
            <label>
              {french ? "Honoraires" : "Honorarium"}
              <select
                value={text(draft, "honorarium")}
                onChange={(e) => update("honorarium", e.target.value)}
                required
              >
                <option value="">—</option>
                <option value="offered">
                  {french ? "Proposés" : "Offered"}
                </option>
                <option value="not_offered">
                  {french ? "Non proposés" : "Not offered"}
                </option>
                <option value="discuss">
                  {french ? "À discuter" : "To be discussed"}
                </option>
              </select>
            </label>
          ) : null}
          <div className="protocol-inset">
            {toggle(
              "invitationLetter",
              french
                ? "Lettre d’invitation formelle requise"
                : "Formal invitation letter required",
            )}
            {toggle(
              "visaLetter",
              french ? "Lettre de visa requise" : "Visa letter required",
            )}
            {toggle(
              "governmentProtocol",
              french
                ? "Protocole gouvernemental ou diplomatique impliqué"
                : "Government or diplomatic protocol involved",
            )}
            {toggle(
              "otherPrincipals",
              french
                ? "D’autres principaux ou chefs d’État seront présents"
                : "Other principals or heads of state will attend",
            )}
          </div>
          <label>
            {french ? "Considérations de sécurité" : "Security considerations"}
            <textarea
              value={text(draft, "securityConsiderations")}
              onChange={(e) => update("securityConsiderations", e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </label>
          <div className="protocol-grid">
            {input(
              "contactName",
              french ? "Contact sur place" : "On-the-ground contact",
              { required: true, minLength: 2, maxLength: 120 },
            )}
            {input(
              "contactPhone",
              french ? "Téléphone du contact" : "Contact phone",
              { type: "tel", required: true, minLength: 7, maxLength: 40 },
            )}
          </div>
        </fieldset>
        <fieldset data-step="5" hidden={step !== 5} disabled={step !== 5}>
          <legend>
            {french ? "Vérifiez et confirmez" : "Review and confirm"}
          </legend>
          <div className="protocol-summary">
            <p>
              {french
                ? `Vous invitez Dr Dodoo à participer à «\u00a0${text(draft, "eventName")}\u00a0» à ${text(draft, "eventCity")}, devant environ ${text(draft, "audienceSize")} personnes.`
                : `You are inviting Dr Dodoo to take part in “${text(draft, "eventName")}” in ${text(draft, "eventCity")}, for an audience of approximately ${text(draft, "audienceSize")}.`}
            </p>
            <p>
              {french
                ? `La demande est faite ${text(draft, "capacity") === "official" ? "dans son rôle officiel" : text(draft, "capacity") === "personal" ? "à titre personnel" : "avec une qualité à clarifier"}, au nom de ${text(draft, "organisationName")}.`
                : `The request is in ${text(draft, "capacity") === "official" ? "his official role" : text(draft, "capacity") === "personal" ? "his personal capacity" : "a capacity to be clarified"}, on behalf of ${text(draft, "organisationName")}.`}
            </p>
            <button type="button" onClick={() => setStep(0)}>
              {french ? "Modifier la qualité" : "Edit capacity"}
            </button>
            <button type="button" onClick={() => setStep(2)}>
              {french ? "Modifier l’intervention" : "Edit engagement"}
            </button>
          </div>
          {toggle(
            "dataProcessing",
            french
              ? "J’accepte le traitement de ces données conformément à la politique de confidentialité."
              : "I consent to this data being processed under the privacy notice.",
            true,
          )}
          {toggle(
            "authorityToInvite",
            french
              ? "Je confirme être autorisé(e) à envoyer cette invitation au nom de l’organisation."
              : "I confirm that I am authorised to invite on the organisation’s behalf.",
            true,
          )}
        </fieldset>
        <div className="protocol-actions">
          {step > 0 ? (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setStep((current) => {
                  const next = current - 1;
                  localStorage.setItem(stepStorageKey, String(next));
                  return next;
                })
              }
            >
              {t.back}
            </button>
          ) : null}
          <button type="submit" disabled={state === "sending"}>
            {step === 5 ? (state === "sending" ? t.sending : t.submit) : t.next}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              localStorage.removeItem(storageKey);
              localStorage.removeItem(stepStorageKey);
              setDraft(initialDraft);
              setStep(0);
              setRestored(false);
            }}
          >
            {t.clear}
          </button>
        </div>
        {state === "error" ? (
          <p className="protocol-error" role="alert">
            {t.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
