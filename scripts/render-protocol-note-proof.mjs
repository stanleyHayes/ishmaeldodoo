import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { protocolNoteHtml } from "../apps/api/dist/modules/protocol-desk/application/protocol-note.service.js";
import { BrowserPdfService } from "../apps/api/dist/modules/press-kit/browser-pdf.service.js";

const outputDirectory = "output/pdf";
const generatedAt = new Date("2026-08-10T12:00:00.000Z");
const runFile = promisify(execFile);
const portrait = `<svg xmlns="http://www.w3.org/2000/svg" width="630" height="780" viewBox="0 0 630 780"><rect width="630" height="780" fill="#e9e1d4"/><circle cx="315" cy="270" r="125" fill="#334155"/><path d="M105 750c20-190 115-285 210-285s190 95 210 285" fill="#334155"/><text x="315" y="710" text-anchor="middle" font-family="Arial" font-size="44" fill="#e9e1d4">QA</text></svg>`;
const portraitDataUri = `data:image/svg+xml;base64,${Buffer.from(portrait).toString("base64")}`;

function view(locale) {
  const french = locale === "fr-FR";
  return {
    request: {
      reference: french ? "PD-2026-QAFR" : "PD-2026-QAEN",
      locale,
      state: "accepted",
      capacity: french ? "official" : "personal",
      engagement: {
        type: "keynote",
        eventName: french
          ? "Forum régional de la finance durable"
          : "Regional Sustainable Finance Forum",
        startsAt: new Date("2026-12-01T09:00:00.000Z"),
      },
      ask: {
        recording: true,
        transcriptRights: true,
        republicationRights: false,
      },
      logistics: {
        travel: "host_covered",
        honorarium: "offered",
        invitationLetter: true,
        visaLetter: french,
        governmentProtocol: french,
        contactName: french ? "Ama Mensah" : "Kojo Owusu",
        contactPhone: "+233 20 000 0000",
      },
    },
    input: {
      speakerContactName: "Project AMANOR Protocol Desk",
      speakerContactEmail: "protocol@example.test",
      technicalRequirements: [
        french
          ? "Retour de scène et adaptateur HDMI de secours"
          : "Stage monitor and backup HDMI adapter",
      ],
      logistics: [
        french
          ? "Transfert terrestre confirmé 24 heures avant l’arrivée"
          : "Ground transfer confirmed 24 hours before arrival",
      ],
      accessibilityRequirements: [
        french
          ? "Accès sans marche entre l’arrivée et la scène"
          : "Step-free route from arrival to stage",
      ],
      arrivalTime: french ? "Arrivée à 08 h 00" : "Arrival at 08:00",
      briefingWindow: french
        ? "Briefing organisateur à 08 h 15"
        : "Host briefing at 08:15",
      rehearsalRequirement: french
        ? "Test technique de quinze minutes"
        : "Fifteen-minute technical rehearsal",
      displayRequirements: french
        ? "Police minimale de 28 points sur les écrans de salle"
        : "Minimum 28-point type on room displays",
      lecternRequired: false,
    },
    identity: {
      legalName: "Synthetic Print QA Record",
      honorific: "Dr.",
      shortName: "QA Record",
      bio120: french
        ? "Ce texte synthétique sert uniquement à vérifier la mise en page bilingue, les caractères accentués, les listes, les sauts de page et les contrôles de capacité du document. Il ne représente aucune biographie ou approbation de production."
        : "This synthetic text exists only to verify bilingual layout, list flow, page breaks, document metadata and capacity safeguards. It is not a production biography or an approved identity claim.",
      portraits: ["11111111-1111-4111-8111-111111111111"],
      titleHistory: [],
    },
    currentTitle: {
      title: french
        ? "Titre synthétique pour contrôle d’impression"
        : "Synthetic title for print verification",
      organisation: "Project AMANOR QA",
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: null,
    },
    rider: {
      key: "qa-keynote",
      name: french
        ? "Rider synthétique - discours principal"
        : "Synthetic keynote rider",
      engagementType: "keynote",
      logistics: [
        french
          ? "Une personne référente accompagne chaque déplacement"
          : "One named liaison accompanies every movement",
      ],
      technicalRequirements: [
        french
          ? "Micro-cravate sans fil avec batterie de secours"
          : "Wireless lapel microphone with backup battery",
        french
          ? "Minuteur visible depuis la scène"
          : "Countdown timer visible from stage",
      ],
      timing: [
        french
          ? "Présence sur site quarante-cinq minutes avant la session"
          : "On site forty-five minutes before the session",
      ],
      travelAndAccommodation: [
        french
          ? "Billet modifiable et hébergement calme"
          : "Flexible ticket and quiet accommodation",
      ],
      recordingAndRepublication: [
        french
          ? "Toute republication nécessite un accord écrit"
          : "Republication requires written permission",
      ],
      honorariumTerms: [
        french
          ? "Les conditions approuvées figurent dans le contrat"
          : "Approved terms are recorded in the contract",
      ],
      protocolRequirements: [
        french
          ? "Confirmer la formule d’adresse avant publication"
          : "Confirm form of address before publication",
      ],
      contactRequirements: [
        french
          ? "Nommer un contact organisateur et un contact protocole"
          : "Name one host contact and one protocol contact",
      ],
      accessibilityRequirements: [
        french
          ? "Partager le plan d’accès avant le déplacement"
          : "Share the accessibility route before travel",
      ],
      versionLabel: "qa-v1",
    },
    portrait: {
      imageDataUri: portraitDataUri,
      credit: "Synthetic QA artwork",
      licence: "Internal print verification only",
    },
    generatedAt,
  };
}

await mkdir(outputDirectory, { recursive: true });
const renderer = new BrowserPdfService();
for (const locale of ["en-GB", "fr-FR"]) {
  const html = protocolNoteHtml(view(locale));
  if (locale === "fr-FR" && /Honoraires|offered|host covered/u.test(html))
    throw new Error("Official-capacity French proof exposed honorarium data");
  if (locale === "en-GB" && !html.includes("Honorarium"))
    throw new Error("Personal-capacity English proof omitted honorarium data");
  const pdf = await renderer.render(html);
  const path = `${outputDirectory}/protocol-note-${locale}-synthetic-proof.pdf`;
  await writeFile(path, pdf, { mode: 0o600 });
  const [{ stdout: information }, { stdout: extractedText }] =
    await Promise.all([
      runFile("pdfinfo", [path], { encoding: "utf8" }),
      runFile("pdftotext", ["-layout", path, "-"], { encoding: "utf8" }),
    ]);
  if (
    !/^Pages:\s+1$/mu.test(information) ||
    !/Page size:.*A4/mu.test(information)
  )
    throw new Error(`${locale} proof must be exactly one A4 page`);
  if (
    locale === "fr-FR" &&
    (!extractedText.includes("Pris en charge par l’hôte") ||
      /host covered|offered|Honoraires/u.test(extractedText))
  )
    throw new Error("French proof failed localization/capacity checks");
  if (
    locale === "en-GB" &&
    (!extractedText.includes("Host covered") ||
      !extractedText.includes("Offered"))
  )
    throw new Error("English proof failed travel/honorarium checks");
  process.stdout.write(`${path}: ${pdf.byteLength} bytes\n`);
}
