import { describe, expect, it } from "vitest";
import { contentKinds } from "./types";
import { publishableSchemas } from "./schemas";

const localized = (english: string) => ({
  "en-GB": english,
  "fr-FR": `FR ${english}`,
  status: { "en-GB": "current" as const, "fr-FR": "current" as const },
  sourceUpdatedAt: new Date("2026-08-09T00:00:00.000Z"),
});
const words = (count: number, stem: string) =>
  Array.from({ length: count }, (_, index) => `${stem}${index + 1}`).join(" ");

const speakingHistory = (slug: string, day: number) => ({
  slug,
  title: localized(`Platform ${day}`),
  host: localized(`Host ${day}`),
  date: new Date(`2026-07-${String(day).padStart(2, "0")}`),
  country: "GH",
  format: "keynote" as const,
  sourceRefs: ["source-1"],
});

const fixtures = {
  identity: {
    singletonKey: "canonical",
    legalName: "Ishmael Dodoo",
    honorific: "Dr",
    displayName: "Dr Ishmael Dodoo",
    shortName: "Ishmael Dodoo",
    familiarName: "Dr Ish",
    pronunciationGuide: localized("Pronunciation"),
    nationality: localized("Ghanaian"),
    languages: ["English", "French"],
    location: localized("Accra"),
    titleHistory: [
      {
        title: localized("Title"),
        longFormTitle: localized("Long-form title"),
        organisation: localized("Institution"),
        from: new Date("2025-01-01"),
        to: null,
        sourceRef: "source-1",
      },
    ],
    bio40: localized("Short biography"),
    bio40SourceRefs: ["source-1"],
    bio120: localized("Medium biography"),
    bio120SourceRefs: ["source-1"],
    bio300: localized("Long biography"),
    bio300SourceRefs: ["source-1"],
    portraits: [],
  },
  atlasNode: {
    slug: "accra",
    label: localized("Accra"),
    institution: localized("Institution"),
    role: localized("Role"),
    country: "GH",
    region: "West Africa",
    startDate: new Date("2020-01-01"),
    endDate: null,
    era: "Public service",
    themes: ["coordination"],
    outcomes: [
      localized("Outcome one"),
      localized("Outcome two"),
      localized("Outcome three"),
    ],
    sourceRefs: ["source-1"],
    homepageProof: {
      order: 1,
      label: localized("Evidence point"),
      emphasisFor: ["government", "investor"],
    },
    homepageAct: {
      act: "forest",
      label: localized("The Forest"),
      dateRange: localized("1998-2008"),
      place: localized("Ghana and Oxford"),
      figure: localized("36 communities"),
      sentence: localized("Ground truth shaped the work."),
    },
  },
  speakingTheme: {
    slug: "financing",
    title: localized("Financing"),
    summary: localized(words(60, "summary")),
    audiences: [localized("Programme directors")],
    formats: ["keynote"],
    sourceRefs: ["source-1"],
    relatedNodes: ["accra"],
    featured: true,
    history: [
      speakingHistory("platform-one", 1),
      speakingHistory("platform-two", 2),
    ],
  },
  signal: {
    slug: "signal-1",
    body: localized(words(150, "signal")),
    publishedAt: new Date(),
    tags: ["policy"],
    confidence: "watching",
    changeMyMind: localized("Evidence"),
    sourceRefs: ["source-1"],
  },
  archiveItem: {
    slug: "speech-1",
    title: localized("Speech"),
    type: "speech",
    date: new Date(),
    language: "en",
    transcriptStatus: "corrected",
    transcript: localized("Opening remarks and questions"),
    transcriptSegments: [
      { startSeconds: 0, text: localized("Opening remarks") },
      { startSeconds: 90, text: localized("Questions") },
    ],
    chapters: [
      {
        slug: "opening",
        label: localized("Opening"),
        startSeconds: 0,
        endSeconds: 90,
      },
      {
        slug: "questions",
        label: localized("Questions"),
        startSeconds: 90,
      },
    ],
    sourceRefs: ["source-1"],
    corrections: [
      {
        incorrectQuote: localized("Incorrect quotation"),
        correction: localized("Correct wording"),
        issuedAt: new Date("2026-08-01"),
        sourceRef: "source-1",
      },
    ],
    approvedForDoctrine: true,
  },
  source: {
    ref: "source-1",
    title: "Record",
    publisher: "Institution",
    accessedAt: new Date(),
    type: "official",
  },
  scholar: {
    name: "Scholar",
    country: "GH",
    institution: "University",
    field: localized("Economics"),
    cohortYear: 2026,
    status: "active",
    story: localized("Story"),
    consentStatus: "granted",
    consentDate: new Date(),
    consentVersion: "scholar-profile-v1",
  },
  officeHoursCycle: {
    slug: "cycle-1",
    title: localized("Office Hours"),
    prompt: localized("Question prompt"),
    opensAt: new Date("2026-08-01"),
    closesAt: new Date("2026-08-10"),
    drawAt: new Date("2026-08-12"),
    answerTargetAt: new Date("2026-08-20"),
    slotCount: 10,
    entries: ["entry-1"],
    drawn: ["entry-1"],
    weightingRules: [localized("Never previously drawn")],
    status: "open",
    fairnessNotice: localized("Fairness"),
    privacyNoticeVersion: "v1",
  },
  officeHoursAnswer: {
    cycleId: "cycle-1",
    questionId: "question-1",
    question: localized("Question"),
    entrantName: "Participant",
    entrantCountry: "GH",
    answer: localized("Answer"),
    publishedAt: new Date(),
    entrantConsent: true,
    redacted: true,
  },
  selahEntry: {
    body: localized("Body"),
    publishedAt: new Date(),
  },
  riderTemplate: {
    key: "standard-keynote",
    name: localized("Standard keynote"),
    engagementType: "keynote",
    logistics: [localized("Logistics")],
    technicalRequirements: [localized("Microphone")],
    timing: [localized("Arrival and rehearsal")],
    travelAndAccommodation: [localized("Host-covered travel")],
    recordingAndRepublication: [localized("Written permission required")],
    honorariumTerms: [localized("Personal-capacity engagements only")],
    protocolRequirements: [localized("Invitation letter")],
    contactRequirements: [localized("Named contacts on both sides")],
    versionLabel: "v1",
  },
  emailTemplate: {
    key: "acknowledgement",
    subject: localized("Request received"),
    bodyText: localized("Text"),
    bodyHtml: localized("HTML"),
    allowedVariables: ["requestId"],
  },
  page: {
    slug: "/privacy",
    title: localized("Record"),
    summary: localized("Summary"),
    sections: [{ key: "opening", body: localized("Body") }],
    seoTitle: localized("SEO title"),
    seoDescription: localized("SEO description"),
    faqs: [
      {
        question: localized("What is the public record?"),
        answer: localized("A source-linked account."),
        sourceRefs: ["source-1"],
      },
    ],
  },
  blackout: {
    startsAt: new Date("2026-08-10"),
    endsAt: new Date("2026-08-11"),
    reason: "public_duty",
    visibility: "busy",
  },
  counterparty: {
    organisationCanonical: "Institution",
    country: "GH",
    status: "clear",
    rationale: "Reviewed",
    reviewedAt: new Date("2026-08-01"),
    reviewDueAt: new Date("2027-08-01"),
    sourceRefs: ["source-1"],
  },
  deskConfiguration: {
    singletonKey: "protocol-desk",
    sensitivityTerms: ["active litigation", "live procurement"],
    approvedThemeTerms: ["financial architecture"],
    liveAgendaTerms: ["regional investment"],
  },
} as const;

describe("CMS content schemas", () => {
  it("provides a passing runtime contract for every declared content kind", () => {
    expect(Object.keys(publishableSchemas).sort()).toEqual(
      [...contentKinds].sort(),
    );
    for (const kind of contentKinds)
      expect(
        publishableSchemas[kind].safeParse(fixtures[kind]).success,
        kind,
      ).toBe(true);
  });

  it("requires every governed FAQ answer to carry source evidence", () => {
    expect(
      publishableSchemas.page.safeParse({
        ...fixtures.page,
        faqs: [
          {
            question: localized("What is verified?"),
            answer: localized("The public record is source linked."),
            sourceRefs: [],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.page.safeParse({
        ...fixtures.page,
        faqs: [fixtures.page.faqs[0], fixtures.page.faqs[0]],
      }).success,
    ).toBe(false);
  });

  it("restricts homepage proof emphasis to unique approved audiences", () => {
    expect(
      publishableSchemas.atlasNode.safeParse({
        ...fixtures.atlasNode,
        homepageProof: {
          ...fixtures.atlasNode.homepageProof,
          emphasisFor: ["investor", "investor"],
        },
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.atlasNode.safeParse({
        ...fixtures.atlasNode,
        homepageProof: {
          ...fixtures.atlasNode.homepageProof,
          emphasisFor: ["unknown"],
        },
      }).success,
    ).toBe(false);
  });

  it("requires the complete sourced bilingual four-act contract for The Record", () => {
    const acts = ["forest", "system", "sahel", "return"] as const;
    const record = {
      ...fixtures.page,
      slug: "/record",
      sections: acts.map((recordAct, index) => ({
        key: `act-${recordAct}`,
        recordAct,
        heading: localized(`Act ${index + 1}`),
        dateline: localized(`Place · ${2000 + index}`),
        fieldImage: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        imageCaption: localized(`Field image ${index + 1}`),
        body: localized("Narrative opening"),
        sourceRefs: ["source-1"],
        claims: [
          {
            body: localized(words(548, `act${index + 1}-`)),
            sourceRefs: ["source-1"],
          },
        ],
        marginalia: [
          {
            label: localized("Portfolio"),
            value: localized("Verified figure"),
            sourceRefs: ["source-1"],
          },
        ],
        ...(index === 0
          ? {
              pullQuote: {
                quote: localized("A verified public statement"),
                venue: localized("Public forum"),
                date: new Date("2026-01-01"),
                sourceRef: "source-1",
              },
            }
          : {}),
      })),
    };
    expect(publishableSchemas.page.safeParse(record).success).toBe(true);
    expect(
      publishableSchemas.page.safeParse({
        ...record,
        sections: record.sections.slice(0, 3),
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.page.safeParse({
        ...record,
        sections: record.sections.map((section) => ({
          ...section,
          claims: [{ body: localized("Too short"), sourceRefs: ["source-1"] }],
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe operational dates and publication consent", () => {
    expect(
      publishableSchemas.blackout.safeParse({
        ...fixtures.blackout,
        endsAt: new Date("2026-08-09"),
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.officeHoursAnswer.safeParse({
        ...fixtures.officeHoursAnswer,
        entrantConsent: false,
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.counterparty.safeParse({
        ...fixtures.counterparty,
        reviewDueAt: new Date("2026-07-01"),
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.counterparty.safeParse({
        ...fixtures.counterparty,
        aliases: ["Institution"],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.counterparty.safeParse({
        ...fixtures.counterparty,
        country: "gh",
      }).success,
    ).toBe(false);
  });

  it("enforces Office Hours timing, transparent draw membership and capacity", () => {
    expect(
      publishableSchemas.officeHoursCycle.safeParse({
        ...fixtures.officeHoursCycle,
        drawAt: new Date("2026-08-09"),
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.officeHoursCycle.safeParse({
        ...fixtures.officeHoursCycle,
        drawn: ["unknown-entry"],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.officeHoursCycle.safeParse({
        ...fixtures.officeHoursCycle,
        slotCount: 1,
        entries: ["entry-1", "entry-2"],
        drawn: ["entry-1", "entry-2"],
      }).success,
    ).toBe(false);
  });

  it("keeps Selah deliberately limited to body and publication time", () => {
    expect(
      publishableSchemas.selahEntry.safeParse({
        ...fixtures.selahEntry,
        tags: ["leadership"],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.selahEntry.safeParse({
        ...fixtures.selahEntry,
        image: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });

  it("requires versioned scholar consent and exactly one approved email key", () => {
    expect(
      publishableSchemas.scholar.safeParse({
        ...fixtures.scholar,
        consentVersion: undefined,
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.emailTemplate.safeParse({
        ...fixtures.emailTemplate,
        key: "custom-message",
      }).success,
    ).toBe(false);
  });

  it("requires evidence for every canonical biography field", () => {
    for (const key of [
      "bio40SourceRefs",
      "bio120SourceRefs",
      "bio300SourceRefs",
    ] as const) {
      expect(
        publishableSchemas.identity.safeParse({
          ...fixtures.identity,
          [key]: [],
        }).success,
        key,
      ).toBe(false);
    }
  });

  it("requires sourced, non-overlapping title history with one open record", () => {
    const current = fixtures.identity.titleHistory[0];
    expect(
      publishableSchemas.identity.safeParse({
        ...fixtures.identity,
        titleHistory: [{ ...current, longFormTitle: undefined }],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.identity.safeParse({
        ...fixtures.identity,
        titleHistory: [
          { ...current, to: new Date("2026-01-01") },
          { ...current, from: new Date("2025-06-01") },
        ],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.identity.safeParse({
        ...fixtures.identity,
        titleHistory: [
          { ...current, from: new Date("2020-01-01") },
          { ...current, from: new Date("2025-01-01") },
        ],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.identity.safeParse({
        ...fixtures.identity,
        titleHistory: [
          {
            ...current,
            from: new Date("2025-01-01"),
            to: new Date("2024-01-01"),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires unique, ordered and positive Archive chapter ranges", () => {
    const archive = fixtures.archiveItem;
    expect(
      publishableSchemas.archiveItem.safeParse({
        ...archive,
        chapters: [
          archive.chapters[0],
          { ...archive.chapters[1], slug: "opening" },
        ],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.archiveItem.safeParse({
        ...archive,
        chapters: [archive.chapters[1], archive.chapters[0]],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.archiveItem.safeParse({
        ...archive,
        chapters: [{ ...archive.chapters[0], endSeconds: 0 }],
      }).success,
    ).toBe(false);
  });

  it("requires timestamped transcript segments to be strictly ordered", () => {
    expect(
      publishableSchemas.archiveItem.safeParse({
        ...fixtures.archiveItem,
        transcriptSegments: [
          fixtures.archiveItem.transcriptSegments[1],
          fixtures.archiveItem.transcriptSegments[0],
        ],
      }).success,
    ).toBe(false);
  });

  it("requires unique Speaking history anchors and transcript context for video", () => {
    const history = {
      slug: "regional-forum",
      title: localized("Regional forum"),
      host: localized("Public Value Forum"),
      date: new Date("2026-07-01"),
      country: "GH",
      format: "keynote" as const,
      sourceRefs: ["source-1"],
    };
    expect(
      publishableSchemas.speakingTheme.safeParse({
        ...fixtures.speakingTheme,
        history: [history, history],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.speakingTheme.safeParse({
        ...fixtures.speakingTheme,
        media: [
          {
            assetId: "00000000-0000-4000-8000-000000000001",
            kind: "video",
            caption: localized("Forum excerpt"),
            sourceRef: "source-1",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.speakingTheme.safeParse({
        ...fixtures.speakingTheme,
        history: [history, speakingHistory("second-platform", 2)],
        media: [
          {
            assetId: "00000000-0000-4000-8000-000000000001",
            kind: "video",
            caption: localized("Forum excerpt"),
            relatedArchive: "regional-forum",
            sourceRef: "source-1",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("enforces Atlas chronology, evidence, outcomes and complete portfolio metadata", () => {
    expect(
      publishableSchemas.atlasNode.safeParse({
        ...fixtures.atlasNode,
        endDate: new Date("2019-01-01"),
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.atlasNode.safeParse({
        ...fixtures.atlasNode,
        outcomes: [localized("Only one")],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.atlasNode.safeParse({
        ...fixtures.atlasNode,
        portfolioValue: 1_000_000,
        valueType: "managed",
      }).success,
    ).toBe(false);
  });

  it("accepts governed profile portrait IDs and rejects profile image URLs", () => {
    const portraitId = "00000000-0000-4000-8000-000000000001";
    expect(
      publishableSchemas.identity.safeParse({
        ...fixtures.identity,
        portraits: [portraitId],
      }).success,
    ).toBe(true);
    expect(
      publishableSchemas.identity.safeParse({
        ...fixtures.identity,
        portraits: ["https://example.test/profile.jpg"],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.identity.safeParse({
        ...fixtures.identity,
        portraits: [portraitId, portraitId, portraitId, portraitId],
      }).success,
    ).toBe(false);
  });

  it("enforces Signal length, tag count and coherent ledger resolution", () => {
    expect(
      publishableSchemas.signal.safeParse({
        ...fixtures.signal,
        body: localized("Too short"),
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.signal.safeParse({
        ...fixtures.signal,
        tags: ["one", "two", "three", "four"],
      }).success,
    ).toBe(false);
    expect(
      publishableSchemas.signal.safeParse({
        ...fixtures.signal,
        resolution: "heldUp",
      }).success,
    ).toBe(false);
  });
});
