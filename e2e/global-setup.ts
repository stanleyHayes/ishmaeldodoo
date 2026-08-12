import mongoose from "mongoose";
import type { webcrypto } from "node:crypto";
import { signRoomKeyManifest } from "@amanor/contracts";
import { encryptMfaSecret } from "../apps/api/src/modules/auth/domain/mfa";
import { hashPassword } from "../apps/api/src/modules/auth/domain/password";
import { createEditorialAuditEvent } from "../apps/api/src/modules/content/application/audit";
import type { Publication } from "../apps/api/src/modules/content/domain/workflow";
import { materializeStructuredPublication } from "../apps/api/src/modules/content/persistence/structured-publication-projection";
import {
  createRequest,
  screenRequest,
} from "../apps/api/src/modules/protocol-desk/domain/engagement-request";
import {
  e2eEdgeEmail,
  e2eEmail,
  e2eHardwareKeyEmail,
  e2eMfaKey,
  e2eMfaSecret,
  e2eMongoUri,
  e2ePassword,
  e2eProtocolReference,
  e2eRoleEmail,
  e2eRoomMongoUri,
  e2eRoomDeniedEmail,
  e2eRoomPrincipalEmail,
} from "./auth-fixture";

export default async function globalSetup(): Promise<void> {
  const connection = await mongoose.createConnection(e2eMongoUri).asPromise();
  const roomConnection = await mongoose
    .createConnection(e2eRoomMongoUri)
    .asPromise();
  const database = connection.db;
  const roomDatabase = roomConnection.db;
  if (!database) throw new Error("The E2E MongoDB database is unavailable");
  if (!roomDatabase) throw new Error("The E2E Room database is unavailable");
  const browserNames = ["chromium", "firefox", "webkit"];
  await Promise.all([
    database.collection("users").deleteMany({}),
    database.collection("sessions").deleteMany({}),
    database.collection("auth_events").deleteMany({}),
    database.collection("webauthn_challenges").deleteMany({}),
    database.collection("webauthn_credentials").deleteMany({}),
    database.collection("auth_rate_limits").deleteMany({}),
    database.collection("protocol_requests").deleteMany({}),
    database.collection("protocol_request_events").deleteMany({}),
    database.collection("protocol_sequences").deleteMany({}),
    database.collection("contact_enquiries").deleteMany({}),
    database.collection("media_assets").deleteMany({
      assetId: {
        $in: [
          "00000000-0000-4000-8000-000000000101",
          "00000000-0000-4000-8000-000000000102",
        ],
      },
    }),
    database.collection("content_versions").deleteMany({
      $or: [
        {
          documentType: "page",
          documentId: {
            $in: [
              "speaking",
              "speaking-request",
              "archive",
              "signals",
              "legacy",
              "contact",
              "record",
              "legal-privacy",
              "legal-terms",
              "legal-disclosure",
              "takedown-chromium",
              "takedown-firefox",
              "takedown-webkit",
            ],
          },
        },
        {
          documentType: {
            $in: ["archiveItem", "speakingTheme", "atlasNode", "scholar"],
          },
        },
        {
          documentType: "signal",
          documentId: {
            $in: [
              ...browserNames.map((name) => `policy-signal-${name}`),
              "published-signal-e2e",
            ],
          },
        },
        { documentType: "identity", documentId: "canonical" },
      ],
    }),
    database.collection("publications").deleteMany({
      $or: [
        {
          documentType: "page",
          documentId: {
            $in: [
              "speaking",
              "speaking-request",
              "archive",
              "signals",
              "legacy",
              "contact",
              "record",
              "legal-privacy",
              "legal-terms",
              "legal-disclosure",
              "takedown-chromium",
              "takedown-firefox",
              "takedown-webkit",
            ],
          },
        },
        {
          documentType: {
            $in: ["archiveItem", "speakingTheme", "atlasNode", "scholar"],
          },
        },
        {
          documentType: "signal",
          documentId: {
            $in: [
              ...browserNames.map((name) => `policy-signal-${name}`),
              "published-signal-e2e",
            ],
          },
        },
        { documentType: "identity", documentId: "canonical" },
      ],
    }),
    database.collection("editorial_audit").deleteMany({
      actorId: "e2e-editor",
    }),
    database.collection("editorial_audit_heads").deleteMany({
      documentId: {
        $in: [
          "speaking",
          "speaking-request",
          "archive",
          "signals",
          "legacy",
          "contact",
          "record",
          "legal-privacy",
          "legal-terms",
          "legal-disclosure",
          "takedown-chromium",
          "takedown-firefox",
          "takedown-webkit",
          "regional-broadcast",
          "public-article",
          "public-value",
          "regional-investment",
          ...browserNames.map((name) => `policy-signal-${name}`),
          "published-signal-e2e",
          "legacy-scholar-e2e",
          "canonical",
          "record-forest",
          "record-system",
          "record-sahel",
          "record-return",
        ],
      },
    }),
  ]);
  const now = new Date();
  const trustAnchorPrivateJwk = JSON.parse(
    process.env.E2E_ROOM_TRUST_ANCHOR_PRIVATE_JWK ?? "null",
  ) as webcrypto.JsonWebKey | null;
  const recipientPublicKey = process.env.E2E_ROOM_RECIPIENT_PUBLIC_KEY;
  if (!trustAnchorPrivateJwk || !recipientPublicKey) {
    throw new Error("The E2E Room cryptographic fixture is unavailable");
  }
  const trustAnchorPrivateKey = await crypto.subtle.importKey(
    "jwk",
    trustAnchorPrivateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const roomManifest = await signRoomKeyManifest({
    body: {
      manifestVersion: 1,
      issuedAt: new Date(now.getTime() - 60_000).toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      keys: [
        {
          keyId: "rk-e2e-principal-2026",
          epoch: 1,
          algorithm: "ECDH-P256",
          purpose: "room-enquiry",
          publicKey: recipientPublicKey,
          notBefore: new Date(now.getTime() - 60_000).toISOString(),
          notAfter: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
          status: "active",
        },
      ],
    },
    trustAnchorKeyId: "ta-e2e-2026",
    trustAnchorPrivateKey,
  });
  await Promise.all([
    roomDatabase.collection("room_enquiries").deleteMany({}),
    roomDatabase.collection("room_events").deleteMany({}),
    roomDatabase.collection("room_key_manifests").deleteMany({}),
  ]);
  await roomDatabase.collection("room_key_manifests").insertOne({
    active: true,
    publishedAt: now,
    manifest: roomManifest,
  });
  const passwordHash = await hashPassword(e2ePassword);
  const mfa = { ...encryptMfaSecret(e2eMfaSecret, e2eMfaKey), enrolledAt: now };
  await database.collection("users").insertMany(
    browserNames
      .flatMap((browserName) => [
        {
          id: `security-${browserName}`,
          email: e2eEmail(browserName),
          roles: ["security_admin"],
        },
        {
          id: `edge-security-${browserName}`,
          email: e2eEdgeEmail(browserName),
          roles: ["editor"],
        },
        {
          id: `room-principal-${browserName}`,
          email: e2eRoomPrincipalEmail(browserName),
          roles: ["principal"],
        },
        {
          id: `room-denied-${browserName}`,
          email: e2eRoomDeniedEmail(browserName),
          roles: ["desk_officer"],
        },
        ...(["desk_officer", "principal"] as const).map((role) => ({
          id: `${role}-${browserName}`,
          email: e2eRoleEmail(role, browserName),
          roles: [role],
        })),
      ])
      .concat([
        {
          id: "hardware-key-chromium",
          email: e2eHardwareKeyEmail,
          roles: ["security_admin"],
        },
      ])
      .map((account) => ({
        userId: account.id,
        emailCanonical: account.email,
        passwordHash,
        roles: account.roles,
        roleVersion: 1,
        invitedAt: now,
        invitationAcceptedAt: now,
        passwordChangedAt: now,
        mfa,
        createdAt: now,
        updatedAt: now,
      })),
  );
  const screenedAt = new Date("2026-08-01T09:00:00.000Z");
  const seededRequests = browserNames.map((browserName, index) => {
    const created = createRequest(
      {
        locale: "en-GB",
        capacity: "personal",
        organisation: {
          name: `Sahel Leadership Forum ${browserName}`,
          type: "multilateral",
          country: "GH",
          website: "https://forum.example",
          convenors: "Regional investment leaders",
        },
        requester: {
          name: "Ama Mensah",
          role: "Programme Director",
          email: `ama-${browserName}@forum.example`,
          phone: "+233200000000",
        },
        engagement: {
          type: "advisory",
          eventName: `Capital Partnership Roundtable ${browserName}`,
          startsAt: new Date(
            `2026-08-${String(8 + index).padStart(2, "0")}T09:00:00.000Z`,
          ),
          endsAt: new Date(
            `2026-08-${String(8 + index).padStart(2, "0")}T10:00:00.000Z`,
          ),
          city: "Accra",
          country: "GH",
          format: "in_person",
          language: "english",
          audienceSize: 120,
          audienceDescription:
            "Ministers, investors and regional chief executives",
        },
        ask: {
          proposedTheme: "Financing regional transformation",
          objective:
            "Connect responsible investment capital with measurable development priorities.",
          otherSpeakers: "Regional principals",
          recording: false,
        },
        logistics: {
          travel: "host_covered",
          honorarium: "discuss",
          invitationLetter: true,
          visaLetter: false,
          governmentProtocol: false,
          otherPrincipals: true,
          contactName: "Kojo Annan",
          contactPhone: "+233200000001",
        },
        consent: {
          dataProcessing: true,
          authorityToInvite: true,
          version: "2026-08",
        },
      },
      9101 + index,
      new Date(screenedAt.getTime() - 60_000),
    );
    const screened = screenRequest(created.request, {
      screenedAt,
      organisationDomainVerified: true,
      counterpartyMatches: ["Governed partner"],
      approvedThemeTerms: ["investment", "transformation"],
    });
    return {
      request: {
        ...screened.request,
        reference: e2eProtocolReference(browserName),
      },
      events: [created.event, screened.event],
    };
  });
  await database
    .collection("protocol_requests")
    .insertMany(seededRequests.map(({ request }) => request));
  await database
    .collection("protocol_request_events")
    .insertMany(seededRequests.flatMap(({ events }) => events));
  const localized = (english: string, french: string) => ({
    "en-GB": english,
    "fr-FR": french,
    status: { "en-GB": "current", "fr-FR": "current" },
    sourceUpdatedAt: now,
  });
  const words = (count: number, stem: string) =>
    Array.from({ length: count }, (_, index) => `${stem}${index + 1}`).join(
      " ",
    );
  const publicationRecord = (
    documentType: string,
    documentId: string,
    payload: unknown,
  ) => ({
    documentType,
    documentId,
    version: 1,
    state: "published",
    authorId: "e2e-editor",
    reviewerId: "e2e-reviewer",
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
    payload,
  });
  await database.collection("content_versions").insertMany([
    publicationRecord("identity", "canonical", {
      singletonKey: "canonical",
      legalName: "Ishmael Nii Amanor Dodoo",
      honorific: "Dr",
      displayName: "Dr Ishmael Nii Amanor Dodoo",
      shortName: "Ishmael Dodoo",
      familiarName: "Dr Ishmael",
      pronunciationGuide: localized("Ish-ma-el", "Ish-ma-el"),
      nationality: localized("Ghanaian", "Ghanéen"),
      languages: ["English", "French"],
      location: localized("Accra", "Accra"),
      titleHistory: [
        {
          title: localized("Current role", "Fonction actuelle"),
          longFormTitle: localized(
            "Current role at the Independent platform",
            "Fonction actuelle à la Plateforme indépendante",
          ),
          organisation: localized(
            "Independent platform",
            "Plateforme indépendante",
          ),
          from: new Date("2026-01-01T00:00:00.000Z"),
          to: null,
          sourceRef: "source-e2e",
        },
      ],
      bio40: localized(
        "Approved short biography.",
        "Biographie courte approuvée.",
      ),
      bio40SourceRefs: ["source-e2e"],
      bio120: localized(
        "Approved medium biography.",
        "Biographie moyenne approuvée.",
      ),
      bio120SourceRefs: ["source-e2e"],
      bio300: localized(
        "Approved long biography.",
        "Biographie longue approuvée.",
      ),
      bio300SourceRefs: ["source-e2e"],
      portraits: [],
    }),
    publicationRecord("source", "source-e2e", {
      ref: "source-e2e",
      title: "Regional delivery record",
      publisher: "Public Evidence Office",
      url: "https://evidence.example.test/regional-delivery",
      accessedAt: new Date("2026-08-01T00:00:00.000Z"),
      type: "official",
      notes: "Internal verification note that must never be public.",
    }),
    publicationRecord("source", "source-homepage", {
      ref: "source-homepage",
      title: "Homepage evidence record",
      publisher: "Independent Archive",
      accessedAt: new Date("2026-08-02T00:00:00.000Z"),
      type: "firstParty",
      notes: "Private provenance review detail.",
    }),
    publicationRecord("page", "contact", {
      slug: "/contact",
      title: localized("Contact", "Contact"),
      summary: localized(
        "Use the appropriate governed route for a general message, invitation or media enquiry.",
        "Utilisez la voie appropriée pour un message général, une invitation ou une demande presse.",
      ),
      sections: [],
      seoTitle: localized("Contact", "Contact"),
      seoDescription: localized(
        "Send a general enquiry.",
        "Envoyer une demande générale.",
      ),
      faqs: [
        {
          question: localized(
            "Which contact route should I use?",
            "Quelle voie de contact dois-je utiliser ?",
          ),
          answer: localized(
            "Use this form for general messages, the Protocol Desk for invitations, and the media route for press enquiries.",
            "Utilisez ce formulaire pour les messages généraux, le Bureau du protocole pour les invitations et la voie presse pour les demandes des médias.",
          ),
          sourceRefs: ["source-e2e"],
        },
      ],
      noIndex: false,
    }),
    publicationRecord("page", "legal-privacy", {
      slug: "/legal/privacy",
      title: localized("Privacy notice", "Avis de confidentialité"),
      summary: localized(
        "How this independent platform handles personal information.",
        "Comment cette plateforme indépendante traite les données personnelles.",
      ),
      sections: [
        {
          key: "data-rights",
          heading: localized("Your data rights", "Vos droits sur les données"),
          body: localized(
            "Contact the platform to request access, correction or deletion where the law permits.",
            "Contactez la plateforme pour demander l’accès, la rectification ou la suppression lorsque la loi le permet.",
          ),
          sourceRefs: ["source-e2e"],
        },
      ],
      seoTitle: localized("Privacy notice", "Avis de confidentialité"),
      seoDescription: localized(
        "Read the platform privacy notice.",
        "Consultez l’avis de confidentialité de la plateforme.",
      ),
      noIndex: false,
    }),
    publicationRecord("page", "legal-terms", {
      slug: "/legal/terms",
      title: localized("Terms of use", "Conditions d’utilisation"),
      summary: localized(
        "The terms that govern use of this independent platform.",
        "Les conditions qui régissent l’utilisation de cette plateforme indépendante.",
      ),
      sections: [
        {
          key: "responsible-use",
          heading: localized("Responsible use", "Utilisation responsable"),
          body: localized(
            "Use published material lawfully and preserve its source context.",
            "Utilisez les contenus publiés légalement et conservez leur contexte de source.",
          ),
          sourceRefs: ["source-e2e"],
        },
      ],
      seoTitle: localized("Terms of use", "Conditions d’utilisation"),
      seoDescription: localized(
        "Read the platform terms of use.",
        "Consultez les conditions d’utilisation de la plateforme.",
      ),
      noIndex: false,
    }),
    publicationRecord("page", "legal-disclosure", {
      slug: "/legal/disclosure",
      title: localized("Independence disclosure", "Déclaration d’indépendance"),
      summary: localized(
        "This personal platform is independent and is not an official government website.",
        "Cette plateforme personnelle est indépendante et ne constitue pas un site officiel du gouvernement.",
      ),
      sections: [
        {
          key: "capacity",
          heading: localized("Personal capacity", "Capacité personnelle"),
          body: localized(
            "Published views and activities are presented in a personal capacity unless explicitly stated otherwise.",
            "Les opinions et activités publiées sont présentées à titre personnel, sauf indication explicite contraire.",
          ),
          sourceRefs: ["source-e2e"],
        },
      ],
      seoTitle: localized(
        "Independence disclosure",
        "Déclaration d’indépendance",
      ),
      seoDescription: localized(
        "Read the platform independence disclosure.",
        "Consultez la déclaration d’indépendance de la plateforme.",
      ),
      noIndex: false,
    }),
    publicationRecord("page", "speaking", {
      slug: "/speaking",
      title: localized("Speaking", "Interventions"),
      summary: localized(
        "Governed themes for public and institutional audiences.",
        "Des thèmes contrôlés pour les publics et les institutions.",
      ),
      sections: [],
      seoTitle: localized("Speaking", "Interventions"),
      seoDescription: localized(
        "Explore published speaking themes.",
        "Découvrez les thèmes d’intervention publiés.",
      ),
      noIndex: false,
    }),
    publicationRecord("page", "speaking-request", {
      slug: "/speaking/request",
      title: localized("The Protocol Desk", "Le Bureau du protocole"),
      summary: localized(
        "A clear, auditable route for engagement invitations.",
        "Une voie claire et traçable pour les invitations.",
      ),
      sections: [
        {
          key: "before-you-begin",
          heading: localized("Before you begin", "Avant de commencer"),
          body: localized(
            "The Principal receives more requests than he can accept. A decline is not a judgement of your event, and every complete request will receive an answer.",
            "Le Principal reçoit plus de demandes qu’il ne peut en accepter. Un refus ne constitue pas un jugement sur votre événement, et chaque demande complète recevra une réponse.",
          ),
          sourceRefs: [],
        },
      ],
      seoTitle: localized("Protocol Desk", "Bureau du protocole"),
      seoDescription: localized(
        "Submit an engagement invitation.",
        "Proposer une intervention.",
      ),
      noIndex: false,
    }),
    publicationRecord("page", "archive", {
      slug: "/archive",
      title: localized("The Archive", "Les archives"),
      summary: localized(
        "Published speeches, interviews and broadcasts with governed transcripts.",
        "Discours, entretiens et émissions publiés avec des transcriptions contrôlées.",
      ),
      sections: [],
      seoTitle: localized("Archive", "Archives"),
      seoDescription: localized(
        "Search the published Archive.",
        "Rechercher dans les archives publiées.",
      ),
      noIndex: false,
    }),
    publicationRecord("page", "signals", {
      slug: "/signals",
      title: localized("Signal Board", "Tableau des signaux"),
      summary: localized(
        "Published, sourced judgements with explicit confidence and review criteria.",
        "Des analyses publiées et sourcées, avec un niveau de confiance et des critères de révision explicites.",
      ),
      sections: [],
      seoTitle: localized("Signal Board", "Tableau des signaux"),
      seoDescription: localized(
        "Review published Signals and their evidence.",
        "Consultez les signaux publiés et leurs preuves.",
      ),
      noIndex: false,
    }),
    publicationRecord("page", "legacy", {
      slug: "/legacy",
      title: localized("Legacy", "Héritage"),
      summary: localized(
        "Consent-cleared scholar journeys without unapproved impact claims.",
        "Des parcours de chercheurs publiés avec consentement, sans affirmations d’impact non approuvées.",
      ),
      sections: [],
      seoTitle: localized("Legacy", "Héritage"),
      seoDescription: localized(
        "Published scholar journeys.",
        "Parcours publiés de chercheurs.",
      ),
      noIndex: false,
    }),
    publicationRecord("page", "record", {
      slug: "/record",
      title: localized("A record in four acts", "Un parcours en quatre actes"),
      summary: localized(
        "A synthetic, fully sourced long-form profile used only for browser verification.",
        "Un profil long synthétique et entièrement sourcé, utilisé uniquement pour la vérification du navigateur.",
      ),
      sections: (["forest", "system", "sahel", "return"] as const).map(
        (recordAct, index) => ({
          key: `act-${recordAct}`,
          recordAct,
          heading: localized(
            ["The Forest", "The System", "The Sahel", "The Return"][index]!,
            ["La forêt", "Le système", "Le Sahel", "Le retour"][index]!,
          ),
          dateline: localized(
            `Field location · ${1998 + index * 8}`,
            `Lieu de terrain · ${1998 + index * 8}`,
          ),
          fieldImage: `00000000-0000-4000-8000-${String(index + 201).padStart(12, "0")}`,
          imageCaption: localized(
            `Governed field image ${index + 1}`,
            `Image de terrain contrôlée ${index + 1}`,
          ),
          body: localized(
            `Act ${index + 1} opening.`,
            `Ouverture de l’acte ${index + 1}.`,
          ),
          sourceRefs: ["source-e2e"],
          claims: [
            {
              body: localized(
                words(547, `verified-act-${index + 1}-`),
                words(547, `preuve-acte-${index + 1}-`),
              ),
              sourceRefs: ["source-e2e"],
            },
          ],
          marginalia: [
            {
              label: localized("Verified figure", "Chiffre vérifié"),
              value: localized(
                `${index + 1} governed outcome`,
                `${index + 1} résultat contrôlé`,
              ),
              sourceRefs: ["source-e2e"],
            },
          ],
          ...(index === 0
            ? {
                pullQuote: {
                  quote: localized(
                    "A verified public statement for browser testing.",
                    "Une déclaration publique vérifiée pour les tests navigateur.",
                  ),
                  venue: localized("Public forum", "Forum public"),
                  date: new Date("2026-01-01T00:00:00.000Z"),
                  sourceRef: "source-e2e",
                },
              }
            : {}),
        }),
      ),
      seoTitle: localized("The Record", "Le parcours"),
      seoDescription: localized(
        "A four-act public record.",
        "Un parcours public en quatre actes.",
      ),
      noIndex: false,
    }),
    ...(["forest", "system", "sahel", "return"] as const).map((act, index) =>
      publicationRecord("atlasNode", `record-${act}`, {
        slug: `record-${act}`,
        label: localized(`Record ${act}`, `Parcours ${act}`),
        institution: localized(
          `Institution ${index + 1}`,
          `Institution ${index + 1}`,
        ),
        role: localized(`Role ${index + 1}`, `Fonction ${index + 1}`),
        country: "GH",
        startDate: new Date(`${2000 + index * 5}-01-01T00:00:00.000Z`),
        endDate:
          index === 3
            ? null
            : new Date(`${2004 + index * 5}-12-31T00:00:00.000Z`),
        era: localized(`Act ${index + 1}`, `Acte ${index + 1}`),
        themes: ["coordination"],
        portfolioValue: (index + 1) * 1_000_000,
        currency: "USD",
        valueYear: 2004 + index * 5,
        valueType: "managed",
        outcomes: [
          localized("Verified outcome one", "Premier résultat vérifié"),
          localized("Verified outcome two", "Deuxième résultat vérifié"),
          localized("Verified outcome three", "Troisième résultat vérifié"),
        ],
        sourceRefs: ["source-e2e"],
        homepageProof: {
          order: index + 1,
          label: localized(
            `Homepage proof ${index + 1}`,
            `Preuve d’accueil ${index + 1}`,
          ),
          emphasisFor: [],
        },
        homepageAct: {
          act: (["forest", "system", "bridge", "architecture"] as const)[index],
          label: localized(`Act ${index + 1}`, `Acte ${index + 1}`),
          dateRange: localized(
            `${2000 + index * 5}-${2004 + index * 5}`,
            `${2000 + index * 5}-${2004 + index * 5}`,
          ),
          place: localized("Ghana", "Ghana"),
          figure: localized(
            `${index + 1} verified outcomes`,
            `${index + 1} résultats vérifiés`,
          ),
          sentence: localized(
            `Governed evidence for act ${index + 1}.`,
            `Preuve contrôlée pour l’acte ${index + 1}.`,
          ),
        },
      }),
    ),
    ...Array.from({ length: 5 }, (_, offset) => {
      const index = offset + 4;
      return publicationRecord("atlasNode", `homepage-proof-${index + 1}`, {
        slug: `homepage-proof-${index + 1}`,
        label: localized(`Proof node ${index + 1}`, `Nœud preuve ${index + 1}`),
        institution: localized("Evidence institution", "Institution preuve"),
        role: localized("Evidence role", "Fonction preuve"),
        country: "GH",
        region: "West Africa",
        startDate: new Date(`${2015 + offset}-01-01T00:00:00.000Z`),
        endDate: new Date(`${2015 + offset}-12-31T00:00:00.000Z`),
        era: localized("Evidence", "Preuve"),
        themes: [index === 4 ? "financing" : "coordination"],
        outcomes: [
          localized("Verified outcome one", "Premier résultat vérifié"),
          localized("Verified outcome two", "Deuxième résultat vérifié"),
          localized("Verified outcome three", "Troisième résultat vérifié"),
        ],
        sourceRefs: ["source-e2e"],
        homepageProof: {
          order: index + 1,
          label: localized(
            `Homepage proof ${index + 1}`,
            `Preuve d’accueil ${index + 1}`,
          ),
          emphasisFor: index === 8 ? ["investor"] : [],
        },
      });
    }),
    publicationRecord("archiveItem", "regional-broadcast", {
      slug: "regional-broadcast",
      title: localized(
        "Regional investment broadcast",
        "Émission sur l’investissement régional",
      ),
      type: "broadcast",
      venue: "Public Media Forum",
      city: "Dakar",
      country: "Senegal",
      date: new Date("2026-07-10T00:00:00.000Z"),
      language: "en",
      mediaUrl: "https://media.example.test/regional-broadcast.mp4",
      transcript: localized(
        "Opening remarks.\nA discussion of regional investment priorities.",
        "Remarques liminaires.\nUne discussion sur les priorités régionales d’investissement.",
      ),
      transcriptStatus: "corrected",
      transcriptSegments: [
        {
          startSeconds: 0,
          text: localized("Opening remarks.", "Remarques liminaires."),
        },
        {
          startSeconds: 90,
          text: localized(
            "A discussion of regional investment priorities.",
            "Une discussion sur les priorités régionales d’investissement.",
          ),
        },
      ],
      chapters: [
        {
          slug: "opening",
          label: localized("Opening remarks", "Remarques liminaires"),
          startSeconds: 0,
          endSeconds: 90,
        },
        {
          slug: "priorities",
          label: localized(
            "Investment priorities",
            "Priorités d’investissement",
          ),
          startSeconds: 90,
        },
      ],
      sourceRefs: ["source-e2e"],
      corrections: [
        {
          incorrectQuote: localized(
            "An inaccurate quotation.",
            "Une citation inexacte.",
          ),
          correction: localized(
            "The verified wording.",
            "La formulation vérifiée.",
          ),
          issuedAt: new Date("2026-08-01T00:00:00.000Z"),
          sourceRef: "source-e2e",
        },
      ],
      approvedForDoctrine: false,
    }),
    publicationRecord("archiveItem", "public-article", {
      slug: "public-article",
      title: localized(
        "Public value in practice",
        "La valeur publique en pratique",
      ),
      type: "article",
      city: "Accra",
      country: "Ghana",
      date: new Date("2026-06-01T00:00:00.000Z"),
      language: "en",
      transcript: localized(
        "Public value in practice.",
        "La valeur publique en pratique.",
      ),
      transcriptStatus: "corrected",
      sourceRefs: ["source-e2e"],
      approvedForDoctrine: false,
    }),
    publicationRecord("speakingTheme", "public-value", {
      slug: "public-value",
      title: localized("Public value", "Valeur publique"),
      summary: localized(words(60, "delivery"), words(60, "livraison")),
      audiences: [
        localized(
          "A shared frame for responsible delivery",
          "Un cadre commun pour une mise en œuvre responsable",
        ),
      ],
      formats: ["keynote", "institutional_briefing"],
      sourceRefs: ["source-e2e"],
      relatedNodes: [],
      featured: true,
      history: [
        {
          slug: "forum-2026",
          title: localized("Regional forum", "Forum régional"),
          host: localized("Public Value Forum", "Forum de la valeur publique"),
          date: new Date("2026-07-01T00:00:00.000Z"),
          city: "Accra",
          country: "Ghana",
          format: "keynote",
          sourceRefs: ["source-e2e"],
        },
        {
          slug: "summit-2025",
          title: localized("Delivery summit", "Sommet de la mise en œuvre"),
          host: localized("Delivery Network", "Réseau de mise en œuvre"),
          date: new Date("2025-11-01T00:00:00.000Z"),
          city: "Dakar",
          country: "Senegal",
          format: "keynote",
          sourceRefs: ["source-e2e"],
        },
      ],
      media: [
        {
          assetId: "00000000-0000-4000-8000-000000000101",
          kind: "video",
          caption: localized(
            "Regional forum excerpt",
            "Extrait du forum régional",
          ),
          relatedArchive: "regional-broadcast",
          sourceRef: "source-e2e",
        },
      ],
    }),
    publicationRecord("speakingTheme", "regional-investment", {
      slug: "regional-investment",
      title: localized("Regional investment", "Investissement régional"),
      summary: localized(words(60, "capital"), words(60, "capitale")),
      audiences: [
        localized(
          "A practical investment agenda",
          "Un programme d’investissement concret",
        ),
      ],
      formats: ["workshop", "plenary_panel"],
      sourceRefs: ["source-e2e"],
      relatedNodes: [],
      featured: false,
      history: [
        {
          slug: "investment-forum-2025",
          title: localized("Investment forum", "Forum de l’investissement"),
          host: localized("Regional Forum", "Forum régional"),
          date: new Date("2025-09-01T00:00:00.000Z"),
          country: "Ghana",
          format: "keynote",
          sourceRefs: ["source-e2e"],
        },
        {
          slug: "capital-dialogue-2026",
          title: localized("Capital dialogue", "Dialogue sur le capital"),
          host: localized("Capital Network", "Réseau du capital"),
          date: new Date("2026-02-01T00:00:00.000Z"),
          country: "Senegal",
          format: "keynote",
          sourceRefs: ["source-e2e"],
        },
      ],
    }),
    ...browserNames.map((browserName) =>
      publicationRecord("page", `takedown-${browserName}`, {
        slug: `/takedown-${browserName}`,
        title: localized("Takedown rehearsal", "Répétition de retrait"),
        summary: localized(
          "A disposable publication used to verify the governed takedown path.",
          "Une publication jetable utilisée pour vérifier le processus de retrait contrôlé.",
        ),
        sections: [],
        seoTitle: localized("Takedown rehearsal", "Répétition de retrait"),
        seoDescription: localized(
          "Verify the takedown workflow.",
          "Vérifier le processus de retrait.",
        ),
        noIndex: true,
      }),
    ),
    ...browserNames.map((browserName) => ({
      documentType: "signal",
      documentId: `policy-signal-${browserName}`,
      version: 1,
      state: "in_review",
      authorId: `principal-${browserName}`,
      createdAt: now,
      updatedAt: now,
      payload: {
        slug: `policy-signal-${browserName}`,
        body: localized(words(150, "signal"), words(150, "prevision")),
        publishedAt: now,
        tags: ["finance"],
        confidence: "watching",
        changeMyMind: localized(
          "Material contrary evidence",
          "Des preuves contraires substantielles",
        ),
        sourceRefs: ["source-homepage"],
        approvedBy: `principal-${browserName}`,
      },
    })),
    publicationRecord("signal", "published-signal-e2e", {
      slug: "published-signal-e2e",
      body: localized(words(150, "signal"), words(150, "prevision")),
      publishedAt: new Date("2026-08-10T00:00:00.000Z"),
      tags: ["finance", "public value"],
      confidence: "callingIt",
      changeMyMind: localized(
        "Material contrary evidence from the published source register.",
        "Des preuves contraires substantielles issues du registre publié des sources.",
      ),
      sourceRefs: ["source-e2e"],
      reviewDue: new Date("2026-11-10T00:00:00.000Z"),
      approvedBy: "e2e-reviewer",
    }),
    publicationRecord("scholar", "legacy-scholar-e2e", {
      name: "Ama Mensah",
      country: "GH",
      institution: "Public University",
      field: localized("Public economics", "Économie publique"),
      cohortYear: 2024,
      status: "Active",
      photo: "00000000-0000-4000-8000-000000000102",
      story: localized(
        "A consent-cleared public story.",
        "Un parcours public publié avec consentement.",
      ),
      consentStatus: "granted",
      consentDate: new Date("2026-01-01T00:00:00.000Z"),
      consentVersion: "scholar-v1",
    }),
  ]);
  const seededVersions = await database
    .collection("content_versions")
    .find(
      { authorId: "e2e-editor", version: 1 },
      { projection: { _id: 0, documentType: 1, documentId: 1 } },
    )
    .toArray();
  const seededAudit = seededVersions.map((version) =>
    createEditorialAuditEvent(
      {
        documentType: String(version.documentType),
        documentId: String(version.documentId),
        version: 1,
        actorId: "e2e-editor",
        action: "seeded",
        sequence: 1,
        metadata: { state: "published" },
        changes: [],
      },
      now,
    ),
  );
  if (seededAudit.length > 0) {
    await database.collection("editorial_audit").insertMany(seededAudit);
    await database.collection("editorial_audit_heads").insertMany(
      seededAudit.map((event) => ({
        documentType: event.documentType,
        documentId: event.documentId,
        sequence: event.sequence,
        eventHash: event.eventHash,
        updatedAt: now,
      })),
    );
  }
  const publicationSeeds = [
    ["page", "speaking-request"],
    ["page", "speaking"],
    ["page", "archive"],
    ["page", "signals"],
    ["page", "legacy"],
    ["page", "contact"],
    ["page", "record"],
    ["page", "legal-privacy"],
    ["page", "legal-terms"],
    ["page", "legal-disclosure"],
    ["identity", "canonical"],
    ["source", "source-e2e"],
    ["source", "source-homepage"],
    ["archiveItem", "regional-broadcast"],
    ["archiveItem", "public-article"],
    ["speakingTheme", "public-value"],
    ["speakingTheme", "regional-investment"],
    ["atlasNode", "record-forest"],
    ["atlasNode", "record-system"],
    ["atlasNode", "record-sahel"],
    ["atlasNode", "record-return"],
    ["signal", "published-signal-e2e"],
    ["scholar", "legacy-scholar-e2e"],
    ...Array.from(
      { length: 5 },
      (_, offset) => ["atlasNode", `homepage-proof-${offset + 5}`] as const,
    ),
    ...browserNames.map(
      (browserName) => ["page", `takedown-${browserName}`] as const,
    ),
  ].flatMap(([documentType, documentId]) =>
    ["en-GB", "fr-FR"].map((locale) => ({
      documentType,
      documentId,
      locale,
      version: 1,
      publishedAt: now,
    })),
  );
  await database.collection("publications").insertMany(publicationSeeds);
  for (const publication of publicationSeeds) {
    const version = await database.collection("content_versions").findOne({
      documentType: publication.documentType,
      documentId: publication.documentId,
      version: publication.version,
    });
    if (!version)
      throw new Error(
        `Missing E2E version for ${publication.documentType}/${publication.documentId}`,
      );
    await materializeStructuredPublication(
      database,
      publication as Publication,
      version.payload,
    );
  }
  await database.collection("media_assets").insertOne({
    assetId: "00000000-0000-4000-8000-000000000101",
    publicId: "amanor/speaking/forum-2026",
    secureUrl: "https://media.example.test/forum-2026.mp4",
    resourceType: "video",
    format: "mp4",
    duration: 90,
    bytes: 1000,
    version: 1,
    altText: localized("Regional forum excerpt", "Extrait du forum régional"),
    credit: "Public Value Forum",
    licence: "Editorial use",
    transformationPolicy: "editorial",
    retentionPolicy: "standard",
    legalHold: false,
    sourceRef: "source-e2e",
    status: "active",
    createdBy: "e2e-editor",
    createdAt: now,
  });
  await database.collection("media_assets").insertOne({
    assetId: "00000000-0000-4000-8000-000000000102",
    publicId: "amanor/legacy/ama-mensah",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    resourceType: "image",
    format: "jpg",
    width: 864,
    height: 576,
    bytes: 120_253,
    version: 1,
    altText: localized(
      "Ama Mensah at the university library",
      "Ama Mensah à la bibliothèque universitaire",
    ),
    credit: "Project AMANOR",
    licence: "Consent-cleared editorial use",
    transformationPolicy: "editorial",
    retentionPolicy: "consent-bound",
    legalHold: false,
    sourceRef: "source-e2e",
    status: "active",
    createdBy: "e2e-editor",
    createdAt: now,
  });
  await connection.close();
  await roomConnection.close();
}
