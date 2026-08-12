import { z } from "zod";
import { httpsUrlSchema } from "@amanor/contracts";
import { locales, localizedTextSchema, type Locale } from "./types";

const sourceReferenceSchema = z.string().trim().min(1);

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function validateLocalizedWordRange(
  value: z.infer<typeof localizedTextSchema>,
  minimum: number,
  maximum: number,
  context: z.RefinementCtx,
  path: readonly (string | number)[],
): void {
  for (const locale of ["en-GB", "fr-FR"] as const) {
    if (!value[locale]) continue;
    const words = wordCount(value[locale]);
    if (words < minimum || words > maximum)
      context.addIssue({
        code: "custom",
        path: [...path, locale],
        message: `Must contain ${minimum}-${maximum} words; received ${words}`,
      });
  }
}

export const identitySchema = z
  .object({
    singletonKey: z.literal("canonical"),
    legalName: z.string().trim().min(1),
    honorific: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    givenName: z.string().trim().min(1).optional(),
    additionalName: z.string().trim().min(1).optional(),
    familyName: z.string().trim().min(1).optional(),
    shortName: z.string().trim().min(1),
    familiarName: z.string().trim().min(1),
    pronunciationGuide: localizedTextSchema,
    pronunciationAudio: z.string().uuid().optional(),
    nationality: localizedTextSchema,
    languages: z.array(z.string().trim().min(1)).min(1),
    location: localizedTextSchema,
    titleHistory: z
      .array(
        z.object({
          title: localizedTextSchema,
          longFormTitle: localizedTextSchema,
          organisation: localizedTextSchema,
          from: z.coerce.date(),
          to: z.coerce.date().nullable(),
          sourceRef: sourceReferenceSchema,
        }),
      )
      .min(1),
    bio40: localizedTextSchema,
    bio40SourceRefs: z.array(sourceReferenceSchema).min(1),
    bio120: localizedTextSchema,
    bio120SourceRefs: z.array(sourceReferenceSchema).min(1),
    bio300: localizedTextSchema,
    bio300SourceRefs: z.array(sourceReferenceSchema).min(1),
    portraits: z.array(z.string().uuid()).max(3),
    sameAs: z.array(httpsUrlSchema).optional(),
    alumniOf: z.array(z.string().trim().min(1)).optional(),
    knowsAbout: z.array(z.string().trim().min(1)).optional(),
    disambiguation: localizedTextSchema.optional(),
  })
  .superRefine((value, context) => {
    const openRecords = value.titleHistory.filter(
      (record) => record.to === null,
    );
    if (openRecords.length !== 1)
      context.addIssue({
        code: "custom",
        path: ["titleHistory"],
        message: "Title history must contain exactly one current open record",
      });
    const ordered = value.titleHistory
      .map((record, index) => ({ record, index }))
      .sort(
        (left, right) =>
          left.record.from.getTime() - right.record.from.getTime(),
      );
    for (const { record, index } of ordered) {
      if (record.to && record.to <= record.from)
        context.addIssue({
          code: "custom",
          path: ["titleHistory", index, "to"],
          message: "Title end date must follow its start date",
        });
    }
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (!previous || !current) continue;
      if (!previous.record.to || current.record.from <= previous.record.to)
        context.addIssue({
          code: "custom",
          path: ["titleHistory", current.index, "from"],
          message: "Title date ranges must not overlap",
        });
    }
  });

export const atlasNodeSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: localizedTextSchema,
    institution: localizedTextSchema,
    role: localizedTextSchema,
    country: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/u),
    city: z.string().trim().optional(),
    coordinates: z
      .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
      .optional(),
    region: z.string().trim().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable(),
    era: z.string().trim().min(1),
    themes: z.array(z.string().trim().min(1)).min(1),
    portfolioValue: z.number().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    valueYear: z.number().int().min(1900).max(2200).optional(),
    valueType: z.enum(["managed", "raised", "designed"]).optional(),
    outcomes: z.array(localizedTextSchema).min(3).max(5),
    image: z.string().uuid().optional(),
    sourceRefs: z.array(sourceReferenceSchema).default([]),
    relatedArchive: z
      .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
      .optional(),
    homepageProof: z
      .object({
        order: z.number().int().min(1).max(9),
        label: localizedTextSchema,
        emphasisFor: z
          .array(
            z.enum([
              "government",
              "investor",
              "media",
              "youth",
              "philanthropy",
            ]),
          )
          .max(5)
          .refine((items) => new Set(items).size === items.length, {
            message: "Audience emphasis values must be unique",
          })
          .optional(),
      })
      .optional(),
    homepageAct: z
      .object({
        act: z.enum(["forest", "system", "bridge", "architecture"]),
        label: localizedTextSchema,
        dateRange: localizedTextSchema,
        place: localizedTextSchema,
        figure: localizedTextSchema,
        sentence: localizedTextSchema,
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (!value.coordinates && !value.region) {
      context.addIssue({
        code: "custom",
        message: "Coordinates or a region are required",
      });
    }
    if (value.endDate && value.endDate <= value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Atlas end date must follow start date",
      });
    }
    if (value.portfolioValue !== undefined && !value.valueType) {
      context.addIssue({
        code: "custom",
        message: "Portfolio values require a value type",
      });
    }
    if (value.portfolioValue !== undefined && value.sourceRefs.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Portfolio values require a source reference",
      });
    }
    if (
      value.portfolioValue !== undefined &&
      (!value.currency || value.valueYear === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["portfolioValue"],
        message: "Portfolio values require currency and value year",
      });
    }
    if (
      value.portfolioValue === undefined &&
      (value.currency || value.valueYear !== undefined || value.valueType)
    ) {
      context.addIssue({
        code: "custom",
        path: ["portfolioValue"],
        message: "Portfolio metadata requires a portfolio value",
      });
    }
  });

export const signalSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    body: localizedTextSchema,
    publishedAt: z.coerce.date(),
    tags: z.array(z.string().trim().min(1)).min(1).max(3),
    confidence: z.enum(["watching", "expecting", "callingIt"]),
    changeMyMind: localizedTextSchema,
    sourceRefs: z.array(sourceReferenceSchema).min(1),
    reviewDue: z.coerce.date().optional(),
    resolution: z.enum(["heldUp", "partly", "didNot", "tooEarly"]).optional(),
    resolutionNote: localizedTextSchema.optional(),
    resolvedAt: z.coerce.date().optional(),
    approvedBy: z.string().trim().optional(),
  })
  .superRefine((value, context) => {
    if (value.confidence !== "watching" && !value.reviewDue) {
      context.addIssue({
        code: "custom",
        message: "Confident signals require a review date",
      });
    }
    validateLocalizedWordRange(value.body, 150, 250, context, ["body"]);
    const resolutionFields = [
      value.resolution,
      value.resolutionNote,
      value.resolvedAt,
    ];
    const resolutionCount = resolutionFields.filter(
      (field) => field !== undefined,
    ).length;
    if (resolutionCount > 0 && resolutionCount < resolutionFields.length) {
      context.addIssue({
        code: "custom",
        path: ["resolution"],
        message: "Resolution, note and timestamp must be recorded together",
      });
    }
    if (value.confidence === "watching" && resolutionCount > 0) {
      context.addIssue({
        code: "custom",
        path: ["resolution"],
        message: "Watching signals do not enter the Foresight Ledger",
      });
    }
    if (
      value.resolvedAt &&
      value.reviewDue &&
      value.resolvedAt < value.reviewDue
    ) {
      context.addIssue({
        code: "custom",
        path: ["resolvedAt"],
        message: "A signal cannot resolve before its review date",
      });
    }
  });

export const archiveItemSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: localizedTextSchema,
    type: z.enum(["speech", "interview", "panel", "article", "broadcast"]),
    venue: z.string().trim().optional(),
    city: z.string().trim().optional(),
    country: z.string().trim().optional(),
    date: z.coerce.date(),
    language: z.enum(["en", "fr"]),
    mediaUrl: httpsUrlSchema.optional(),
    transcript: localizedTextSchema,
    transcriptStatus: z.enum(["machine", "corrected"]),
    transcriptSegments: z
      .array(
        z.object({
          startSeconds: z.number().int().nonnegative(),
          text: localizedTextSchema,
        }),
      )
      .max(500)
      .optional(),
    chapters: z
      .array(
        z.object({
          slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          label: localizedTextSchema,
          startSeconds: z.number().int().nonnegative(),
          endSeconds: z.number().int().positive().optional(),
        }),
      )
      .max(100)
      .optional(),
    sourceRefs: z.array(sourceReferenceSchema).min(1),
    corrections: z
      .array(
        z.object({
          incorrectQuote: localizedTextSchema,
          correction: localizedTextSchema,
          issuedAt: z.coerce.date(),
          sourceRef: sourceReferenceSchema,
        }),
      )
      .max(50)
      .optional(),
    approvedForDoctrine: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.transcriptStatus === "machine" && value.approvedForDoctrine) {
      context.addIssue({
        code: "custom",
        message: "Machine transcripts cannot enter Doctrine",
      });
    }
    const chapterSlugs = new Set<string>();
    value.chapters?.forEach((chapter, index) => {
      if (chapterSlugs.has(chapter.slug))
        context.addIssue({
          code: "custom",
          path: ["chapters", index, "slug"],
          message: "Chapter slugs must be unique",
        });
      chapterSlugs.add(chapter.slug);
      if (
        chapter.endSeconds !== undefined &&
        chapter.endSeconds <= chapter.startSeconds
      )
        context.addIssue({
          code: "custom",
          path: ["chapters", index, "endSeconds"],
          message: "Chapter end must follow its start",
        });
      if (
        index > 0 &&
        chapter.startSeconds <= value.chapters![index - 1]!.startSeconds
      )
        context.addIssue({
          code: "custom",
          path: ["chapters", index, "startSeconds"],
          message: "Chapter starts must be strictly increasing",
        });
    });
    value.transcriptSegments?.forEach((segment, index) => {
      if (
        index > 0 &&
        segment.startSeconds <=
          value.transcriptSegments![index - 1]!.startSeconds
      )
        context.addIssue({
          code: "custom",
          path: ["transcriptSegments", index, "startSeconds"],
          message: "Transcript segment starts must be strictly increasing",
        });
    });
  });

export const scholarSchema = z
  .object({
    name: z.string().trim().min(1),
    country: z.string().trim().min(2),
    institution: z.string().trim().min(1),
    field: localizedTextSchema,
    cohortYear: z.number().int().min(2000).max(2200),
    status: z.string().trim().min(1),
    photo: z.string().uuid().optional(),
    story: localizedTextSchema,
    consentStatus: z.enum(["pending", "granted", "withdrawn"]),
    consentDate: z.coerce.date().optional(),
    consentVersion: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.consentStatus === "granted" && !value.consentDate) {
      context.addIssue({
        code: "custom",
        message: "Granted consent requires a date",
      });
    }
    if (value.consentStatus === "granted" && !value.consentVersion) {
      context.addIssue({
        code: "custom",
        path: ["consentVersion"],
        message: "Granted consent requires the governing consent version",
      });
    }
  });

export const sourceSchema = z.object({
  ref: z.string().trim().min(1),
  title: z.string().trim().min(1),
  publisher: z.string().trim().min(1),
  url: httpsUrlSchema.optional(),
  accessedAt: z.coerce.date(),
  type: z.enum(["cv", "press", "official", "firstParty"]),
  notes: z.string().trim().optional(),
});

export const speakingThemeSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: localizedTextSchema,
    summary: localizedTextSchema,
    audiences: z.array(localizedTextSchema).min(1),
    formats: z
      .array(
        z.enum([
          "keynote",
          "plenary_panel",
          "fireside",
          "institutional_briefing",
          "media_interview",
          "academic_lecture",
          "youth_address",
          "workshop",
        ]),
      )
      .min(1),
    sourceRefs: z.array(sourceReferenceSchema).min(1),
    relatedNodes: z
      .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
      .default([]),
    featured: z.boolean().default(false),
    history: z
      .array(
        z.object({
          slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          title: localizedTextSchema,
          host: localizedTextSchema,
          date: z.coerce.date(),
          city: z.string().trim().optional(),
          country: z.string().trim().min(2),
          format: z.enum([
            "keynote",
            "plenary_panel",
            "fireside",
            "institutional_briefing",
            "media_interview",
            "academic_lecture",
            "youth_address",
            "workshop",
          ]),
          sourceRefs: z.array(sourceReferenceSchema).min(1),
        }),
      )
      .min(2)
      .max(50)
      .superRefine((items, context) => {
        if (!items) return;
        const slugs = new Set<string>();
        for (const [index, item] of items.entries()) {
          if (slugs.has(item.slug))
            context.addIssue({
              code: "custom",
              path: [index, "slug"],
              message: "Speaking history slugs must be unique",
            });
          slugs.add(item.slug);
        }
      }),
    media: z
      .array(
        z
          .object({
            assetId: z.string().uuid(),
            kind: z.enum(["image", "video"]),
            caption: localizedTextSchema,
            relatedArchive: z
              .string()
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
              .optional(),
            sourceRef: sourceReferenceSchema,
          })
          .superRefine((item, context) => {
            if (item.kind === "video" && !item.relatedArchive)
              context.addIssue({
                code: "custom",
                path: ["relatedArchive"],
                message: "Speaking video requires a related Archive transcript",
              });
          }),
      )
      .max(12)
      .optional(),
  })
  .superRefine((value, context) => {
    validateLocalizedWordRange(value.summary, 45, 75, context, ["summary"]);
  });

export const officeHoursCycleSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: localizedTextSchema,
    prompt: localizedTextSchema,
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
    drawAt: z.coerce.date(),
    answerTargetAt: z.coerce.date(),
    slotCount: z.number().int().positive().max(50),
    entries: z.array(z.string().trim().min(1)).default([]),
    drawn: z.array(z.string().trim().min(1)).default([]),
    weightingRules: z.array(localizedTextSchema).min(1),
    status: z.enum(["draft", "open", "closed", "answering", "complete"]),
    fairnessNotice: localizedTextSchema,
    privacyNoticeVersion: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    if (value.closesAt <= value.opensAt)
      context.addIssue({
        code: "custom",
        message: "Cycle close must follow open",
      });
    if (value.answerTargetAt <= value.closesAt)
      context.addIssue({
        code: "custom",
        message: "Answer target must follow close",
      });
    if (value.drawAt <= value.closesAt)
      context.addIssue({
        code: "custom",
        path: ["drawAt"],
        message: "Cycle draw must follow close",
      });
    if (value.answerTargetAt <= value.drawAt)
      context.addIssue({
        code: "custom",
        path: ["answerTargetAt"],
        message: "Answer target must follow draw",
      });
    if (value.drawn.length > value.slotCount)
      context.addIssue({
        code: "custom",
        path: ["drawn"],
        message: "Drawn entries cannot exceed the configured slot count",
      });
    const entries = new Set(value.entries);
    if (value.drawn.some((entry) => !entries.has(entry)))
      context.addIssue({
        code: "custom",
        path: ["drawn"],
        message: "Every drawn entry must belong to the cycle entries",
      });
  });

export const officeHoursAnswerSchema = z.object({
  cycleId: z.string().trim().min(1),
  questionId: z.string().trim().min(1),
  question: localizedTextSchema,
  entrantName: z.string().trim().min(1),
  entrantCountry: z.string().trim().length(2),
  answer: localizedTextSchema,
  publishedAt: z.coerce.date(),
  entrantConsent: z.literal(true),
  redacted: z.boolean().default(true),
  sourceRefs: z.array(sourceReferenceSchema).default([]),
});

export const selahEntrySchema = z
  .object({
    body: localizedTextSchema,
    publishedAt: z.coerce.date(),
  })
  .strict();

export const riderTemplateSchema = z.object({
  key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: localizedTextSchema,
  engagementType: z.enum([
    "keynote",
    "fireside",
    "panel",
    "workshop",
    "briefing",
  ]),
  logistics: z.array(localizedTextSchema).min(1),
  technicalRequirements: z.array(localizedTextSchema).min(1),
  timing: z.array(localizedTextSchema).min(1),
  travelAndAccommodation: z.array(localizedTextSchema).min(1),
  recordingAndRepublication: z.array(localizedTextSchema).min(1),
  honorariumTerms: z.array(localizedTextSchema).min(1),
  protocolRequirements: z.array(localizedTextSchema).min(1),
  contactRequirements: z.array(localizedTextSchema).min(1),
  accessibilityRequirements: z.array(localizedTextSchema).default([]),
  versionLabel: z.string().trim().min(1),
});

export const emailTemplateSchema = z.object({
  key: z.enum([
    "acknowledgement",
    "status-update",
    "information-request",
    "hold-placed",
    "acceptance",
    "decline-capacity",
    "decline-fit",
    "decline-conflict",
    "follow-up",
  ]),
  subject: localizedTextSchema,
  bodyText: localizedTextSchema,
  bodyHtml: localizedTextSchema,
  allowedVariables: z
    .array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/))
    .default([]),
  transactional: z.boolean().default(true),
});

const pageClaimSchema = z.object({
  body: localizedTextSchema,
  sourceRefs: z.array(sourceReferenceSchema).min(1),
});

const pageMarginaliaSchema = z.object({
  label: localizedTextSchema,
  value: localizedTextSchema,
  sourceRefs: z.array(sourceReferenceSchema).min(1),
  image: z.string().uuid().optional(),
});

const pagePullQuoteSchema = z.object({
  quote: localizedTextSchema,
  venue: localizedTextSchema,
  date: z.coerce.date(),
  sourceRef: sourceReferenceSchema,
});

const pageSectionSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  heading: localizedTextSchema.optional(),
  body: localizedTextSchema,
  sourceRefs: z.array(sourceReferenceSchema).default([]),
  recordAct: z.enum(["forest", "system", "sahel", "return"]).optional(),
  dateline: localizedTextSchema.optional(),
  fieldImage: z.string().uuid().optional(),
  imageCaption: localizedTextSchema.optional(),
  claims: z.array(pageClaimSchema).default([]),
  marginalia: z.array(pageMarginaliaSchema).max(6).default([]),
  pullQuote: pagePullQuoteSchema.optional(),
});

const pageFaqSchema = z.object({
  question: localizedTextSchema.superRefine((value, context) => {
    for (const locale of locales)
      if (value[locale].length > 200)
        context.addIssue({
          code: "custom",
          path: [locale],
          message: "FAQ questions must not exceed 200 characters",
        });
  }),
  answer: localizedTextSchema.superRefine((value, context) => {
    for (const locale of locales)
      if (value[locale].length > 2_000)
        context.addIssue({
          code: "custom",
          path: [locale],
          message: "FAQ answers must not exceed 2,000 characters",
        });
  }),
  sourceRefs: z.array(sourceReferenceSchema).min(1).max(10),
});

function localizedWordCount(
  sections: readonly z.infer<typeof pageSectionSchema>[],
  locale: Locale,
): number {
  return sections.reduce(
    (total, section) =>
      total +
      [
        section.body[locale],
        ...section.claims.map((claim) => claim.body[locale]),
      ]
        .join(" ")
        .trim()
        .split(/\s+/u)
        .filter(Boolean).length,
    0,
  );
}

export const pageSchema = z
  .object({
    slug: z.string().refine(
      (slug) => {
        if (!slug.startsWith("/") || slug.includes("//")) return false;
        const normalized = slug.endsWith("/") ? slug.slice(0, -1) : slug;
        return normalized
          .slice(1)
          .split("/")
          .every(
            (segment) =>
              segment.length > 0 &&
              !segment.startsWith("-") &&
              !segment.endsWith("-") &&
              [...segment].every(
                (character) =>
                  (character >= "a" && character <= "z") ||
                  (character >= "0" && character <= "9") ||
                  character === "-",
              ),
          );
      },
      { message: "Slug must be a lowercase absolute path" },
    ),
    title: localizedTextSchema,
    summary: localizedTextSchema,
    sections: z.array(pageSectionSchema).min(1),
    seoTitle: localizedTextSchema,
    seoDescription: localizedTextSchema,
    ogImage: z.string().uuid().optional(),
    noIndex: z.boolean().default(false),
    faqs: z.array(pageFaqSchema).max(20).default([]),
  })
  .superRefine((page, context) => {
    for (const locale of locales) {
      const questions = page.faqs.map((faq) =>
        faq.question[locale].trim().toLocaleLowerCase(locale),
      );
      if (new Set(questions).size !== questions.length)
        context.addIssue({
          code: "custom",
          path: ["faqs"],
          message: `FAQ questions must be unique in ${locale}`,
        });
    }
    if (page.slug !== "/record") return;
    const acts = page.sections.map((section) => section.recordAct);
    const requiredActs = ["forest", "system", "sahel", "return"] as const;
    if (
      page.sections.length !== 4 ||
      requiredActs.some((act, index) => acts[index] !== act)
    )
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message:
          "The Record requires exactly one section for each of the four acts",
      });
    page.sections.forEach((section, index) => {
      if (
        !section.recordAct ||
        !section.heading ||
        !section.dateline ||
        !section.fieldImage ||
        !section.imageCaption ||
        section.claims.length === 0
      )
        context.addIssue({
          code: "custom",
          path: ["sections", index],
          message:
            "Every Record act requires its act type, heading, dateline, governed field image, caption and sourced claims",
        });
    });
    if (!page.sections.some((section) => section.pullQuote))
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message:
          "The Record requires at least one verified public-statement pull quote",
      });
    for (const locale of locales) {
      const words = localizedWordCount(page.sections, locale);
      if (words < 2_200 || words > 2_800)
        context.addIssue({
          code: "custom",
          path: ["sections"],
          message: `The Record ${locale} narrative must contain 2,200 to 2,800 words; found ${words}`,
        });
    }
  });

export const blackoutSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.enum([
      "travel",
      "public_duty",
      "personal",
      "preparation",
      "other",
    ]),
    visibility: z.enum(["busy", "unavailable"]),
    notes: z.string().trim().max(1_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.endsAt <= value.startsAt)
      context.addIssue({
        code: "custom",
        message: "Blackout end must follow start",
      });
  });

export const counterpartySchema = z
  .object({
    organisationCanonical: z.string().trim().min(1),
    aliases: z.array(z.string().trim().min(2)).max(50).default([]),
    country: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/u),
    status: z.enum(["clear", "watch", "restricted"]),
    rationale: z.string().trim().min(1),
    reviewedAt: z.coerce.date(),
    reviewDueAt: z.coerce.date(),
    sourceRefs: z.array(sourceReferenceSchema).min(1),
  })
  .superRefine((value, context) => {
    if (value.reviewDueAt <= value.reviewedAt)
      context.addIssue({
        code: "custom",
        message: "Counterparty review due date must follow review date",
      });
    const names = [value.organisationCanonical, ...value.aliases].map((name) =>
      name.normalize("NFKC").toLocaleLowerCase("en-GB"),
    );
    if (new Set(names).size !== names.length)
      context.addIssue({
        code: "custom",
        path: ["aliases"],
        message: "Counterparty canonical name and aliases must be unique",
      });
  });

export const deskConfigurationSchema = z.object({
  singletonKey: z.literal("protocol-desk"),
  sensitivityTerms: z.array(z.string().trim().min(3)).min(1).max(100),
  approvedThemeTerms: z.array(z.string().trim().min(3)).min(1).max(30),
  liveAgendaTerms: z.array(z.string().trim().min(3)).max(30).default([]),
});

export const publishableSchemas = {
  identity: identitySchema,
  atlasNode: atlasNodeSchema,
  speakingTheme: speakingThemeSchema,
  signal: signalSchema,
  archiveItem: archiveItemSchema,
  scholar: scholarSchema,
  source: sourceSchema,
  officeHoursCycle: officeHoursCycleSchema,
  officeHoursAnswer: officeHoursAnswerSchema,
  selahEntry: selahEntrySchema,
  riderTemplate: riderTemplateSchema,
  emailTemplate: emailTemplateSchema,
  page: pageSchema,
  blackout: blackoutSchema,
  counterparty: counterpartySchema,
  deskConfiguration: deskConfigurationSchema,
} as const;
