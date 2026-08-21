import { z } from "zod";
export type {
  ApiOperationId,
  ApiOperations,
} from "./generated/api-operations.js";

export const httpsUrlSchema = z.url({ protocol: /^https$/u }).refine(
  (value) => {
    const url = new URL(value);
    return url.username === "" && url.password === "";
  },
  { message: "URL must not contain embedded credentials" },
);

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  timestamp: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export type DateRangedRecord = Readonly<{
  from: Date | string;
  to: Date | string | null;
}>;

/** Resolve the most recently started record that is valid at the given time. */
export function resolveDateRangedRecord<T extends DateRangedRecord>(
  records: readonly T[],
  at = new Date(),
): T | undefined {
  const timestamp = at.getTime();
  return records
    .filter((record) => {
      const from = new Date(record.from).getTime();
      const to = record.to === null ? null : new Date(record.to).getTime();
      return (
        Number.isFinite(from) &&
        from <= timestamp &&
        (to === null || (Number.isFinite(to) && to >= timestamp))
      );
    })
    .sort(
      (left, right) =>
        new Date(right.from).getTime() - new Date(left.from).getTime(),
    )[0];
}

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "unavailable"]),
  service: z.literal("amanor-api"),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const protocolDeskRequestSchema = z
  .object({
    locale: z.enum(["en-GB", "fr-FR"]),
    capacity: z.enum(["official", "personal", "unsure"]),
    capacityContext: z.string().min(5).max(300).optional(),
    capacityFunding: z.string().min(2).max(200).optional(),
    organisation: z.object({
      name: z.string().min(2).max(180),
      type: z.enum([
        "government",
        "multilateral",
        "private_sector",
        "academic",
        "civil_society",
        "media",
        "other",
      ]),
      country: z.string().length(2),
      website: httpsUrlSchema.max(500).optional(),
      convenors: z.string().max(1_000).optional(),
    }),
    requester: z.object({
      name: z.string().min(2).max(120),
      role: z.string().min(2).max(120),
      email: z.email().max(254),
      phone: z.string().min(7).max(40).optional(),
    }),
    engagement: z.object({
      type: z.enum([
        "keynote",
        "panel",
        "fireside",
        "institutional_briefing",
        "media_interview",
        "advisory",
        "academic",
        "youth",
        "written_contribution",
      ]),
      eventName: z.string().min(2).max(200),
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime().optional(),
      city: z.string().min(2).max(120),
      country: z.string().length(2),
      venue: z.string().max(200).optional(),
      format: z.enum(["in_person", "virtual", "hybrid"]),
      language: z.enum(["english", "french", "both"]),
      interpretationProvided: z.boolean().optional(),
      audienceSize: z.number().int().min(1).max(1_000_000),
      audienceDescription: z.string().min(10).max(1_500),
      edition: z.string().max(120).optional(),
    }),
    ask: z.object({
      proposedTheme: z.string().min(2).max(240),
      objective: z.string().min(10).max(1_500),
      otherSpeakers: z.string().max(1_000).optional(),
      recording: z.boolean(),
      transcriptRights: z.boolean().optional(),
      republicationRights: z.boolean().optional(),
    }),
    logistics: z.object({
      travel: z.enum(["host_covered", "not_covered", "discuss"]),
      honorarium: z.enum(["offered", "not_offered", "discuss"]).optional(),
      invitationLetter: z.boolean(),
      visaLetter: z.boolean(),
      governmentProtocol: z.boolean(),
      otherPrincipals: z.boolean(),
      securityConsiderations: z.string().max(1_000).optional(),
      contactName: z.string().min(2).max(120),
      contactPhone: z.string().min(7).max(40),
    }),
    consent: z.object({
      dataProcessing: z.literal(true),
      authorityToInvite: z.literal(true),
      version: z.string().min(1).max(40),
    }),
  })
  .superRefine((input, context) => {
    if (
      input.capacity === "official" &&
      input.logistics.honorarium !== undefined
    )
      context.addIssue({
        code: "custom",
        path: ["logistics", "honorarium"],
        message: "Official-capacity requests cannot record an honorarium",
      });
    if (
      input.capacity === "unsure" &&
      (!input.capacityContext || !input.capacityFunding)
    )
      context.addIssue({
        code: "custom",
        path: ["capacityContext"],
        message: "Capacity clarification is required",
      });
    if (input.ask.objective.split(/\s+/u).filter(Boolean).length > 200)
      context.addIssue({
        code: "custom",
        path: ["ask", "objective"],
        message: "Objective must not exceed 200 words",
      });
  });
export const protocolDeskResponseSchema = z.object({
  reference: z.string().regex(/^PD-\d{4}-\d{4,}$/u),
  state: z.literal("received"),
});
export type ProtocolDeskRequest = z.infer<typeof protocolDeskRequestSchema>;
export type ProtocolDeskResponse = z.infer<typeof protocolDeskResponseSchema>;

export const adminRoles = [
  "principal",
  "desk_officer",
  "editor",
  "translator",
  "reviewer",
  "press_officer",
  "trust_admin",
  "security_admin",
] as const;

export const authenticationMethods = [
  "pwd",
  "totp",
  "recovery",
  "step_up",
  "hwk",
] as const;
export const authenticationMethodSchema = z.enum(authenticationMethods);
export type AuthenticationMethod = z.infer<typeof authenticationMethodSchema>;

const webAuthnBase64UrlSchema = z
  .string()
  .min(1)
  .max(87_384)
  .regex(/^[A-Za-z0-9_-]+$/u);
const webAuthnExtensionsSchema = z.record(z.string().max(128), z.unknown());

export const webAuthnRegistrationResponseSchema = z.object({
  ceremonyId: z.uuid(),
  response: z.object({
    id: webAuthnBase64UrlSchema,
    rawId: webAuthnBase64UrlSchema,
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: webAuthnBase64UrlSchema,
      attestationObject: webAuthnBase64UrlSchema,
      transports: z
        .array(
          z.enum([
            "ble",
            "cable",
            "hybrid",
            "internal",
            "nfc",
            "smart-card",
            "usb",
          ]),
        )
        .max(7)
        .optional(),
      publicKeyAlgorithm: z.number().int().optional(),
      publicKey: webAuthnBase64UrlSchema.optional(),
      authenticatorData: webAuthnBase64UrlSchema.optional(),
    }),
    clientExtensionResults: webAuthnExtensionsSchema,
    authenticatorAttachment: z.enum(["cross-platform", "platform"]).optional(),
  }),
  label: z.string().trim().min(1).max(80),
});

export const webAuthnAuthenticationResponseSchema = z.object({
  ceremonyId: z.uuid(),
  response: z.object({
    id: webAuthnBase64UrlSchema,
    rawId: webAuthnBase64UrlSchema,
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: webAuthnBase64UrlSchema,
      authenticatorData: webAuthnBase64UrlSchema,
      signature: webAuthnBase64UrlSchema,
      userHandle: webAuthnBase64UrlSchema.optional(),
    }),
    clientExtensionResults: webAuthnExtensionsSchema,
    authenticatorAttachment: z.enum(["cross-platform", "platform"]).optional(),
  }),
});

export const hardwareKeySummarySchema = z.object({
  credentialId: webAuthnBase64UrlSchema,
  label: z.string().min(1).max(80),
  deviceType: z.enum(["singleDevice", "multiDevice"]),
  backedUp: z.boolean(),
  transports: z.array(z.string().min(1).max(32)).max(7),
  createdAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().optional(),
});
export const webAuthnOptionsEnvelopeSchema = z
  .object({
    ceremonyId: z.uuid(),
    options: z.object({ challenge: webAuthnBase64UrlSchema }).passthrough(),
  })
  .strict();
export const hardwareKeySummariesSchema = z.array(hardwareKeySummarySchema);

export type WebAuthnRegistrationRequest = z.infer<
  typeof webAuthnRegistrationResponseSchema
>;
export type WebAuthnAuthenticationRequest = z.infer<
  typeof webAuthnAuthenticationResponseSchema
>;
export type HardwareKeySummary = z.infer<typeof hardwareKeySummarySchema>;
export type WebAuthnOptionsEnvelope = z.infer<
  typeof webAuthnOptionsEnvelopeSchema
>;

const recoveryCodeSchema = z
  .string()
  .regex(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/u);
const credentialLoginRequestSchema = z
  .object({
    stage: z.literal("credentials"),
    email: z.email().max(254),
    password: z.string().min(14).max(128),
    challenge: z.never().optional(),
    mfaCode: z.never().optional(),
    recoveryCode: z.never().optional(),
  })
  .strict();
const verificationLoginRequestSchema = z
  .object({
    stage: z.literal("verification"),
    email: z.never().optional(),
    password: z.never().optional(),
    challenge: z.string().min(32).max(1024),
    mfaCode: z
      .string()
      .regex(/^\d{6}$/u)
      .optional(),
    recoveryCode: recoveryCodeSchema.optional(),
  })
  .refine((input) => Boolean(input.mfaCode) !== Boolean(input.recoveryCode), {
    message: "Provide exactly one verification method",
  });
export const loginRequestSchema = z.discriminatedUnion("stage", [
  credentialLoginRequestSchema,
  verificationLoginRequestSchema,
]);

export const loginChallengeResponseSchema = z.object({
  state: z.literal("mfa_required"),
  challenge: z.string().min(32).max(1024),
  expiresIn: z.literal(300),
});

export const authSessionResponseSchema = z.object({
  accessToken: z.string().min(1),
  csrfToken: z.string().min(32).optional(),
  expiresIn: z.literal(300),
  user: z.object({
    id: z.string().min(1),
    roles: z.array(z.enum(adminRoles)).min(1),
  }),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginChallengeResponse = z.infer<
  typeof loginChallengeResponseSchema
>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const adminSessionSchema = z.object({
  sessionId: z.string().min(1),
  familyId: z.string().min(1),
  authenticationMethods: z
    .array(authenticationMethodSchema)
    .min(1)
    .max(authenticationMethods.length)
    .refine((methods) => new Set(methods).size === methods.length, {
      message: "Authentication methods must be unique",
    }),
  createdAt: z.coerce.date(),
  rotatedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date(),
  revokedAt: z.coerce.date().optional(),
  current: z.boolean(),
});

export const adminSessionsResponseSchema = z.array(adminSessionSchema);
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const administratorSummarySchema = z.object({
  userId: z.string().min(1),
  emailCanonical: z.email().max(254),
  roles: z.array(z.enum(adminRoles)).min(1),
  roleVersion: z.number().int().positive(),
  disabledAt: z.coerce.date().optional(),
  invitedAt: z.coerce.date().optional(),
  invitationAcceptedAt: z.coerce.date().optional(),
});
export const administratorsResponseSchema = z.array(administratorSummarySchema);
export const administratorRolesUpdateSchema = z.object({
  roles: z.array(z.enum(adminRoles)).min(1).max(adminRoles.length),
});
export const administratorStatusUpdateSchema = z.object({
  disabled: z.boolean(),
});
export type AdministratorSummary = z.infer<typeof administratorSummarySchema>;
export type AdministratorRolesUpdate = z.infer<
  typeof administratorRolesUpdateSchema
>;
export const administratorInvitationRequestSchema = z.object({
  email: z.email().max(254),
  roles: z.array(z.enum(adminRoles)).min(1).max(adminRoles.length),
});
export const administratorInvitationResponseSchema = z.object({
  administrator: administratorSummarySchema,
  invitationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});
export const invitationSetupRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});
export const invitationSetupResponseSchema = z.object({
  email: z.email().max(254),
  enrollmentUri: z.string().startsWith("otpauth://totp/"),
  expiresAt: z.coerce.date(),
});
export const invitationAcceptanceRequestSchema =
  invitationSetupRequestSchema.extend({
    password: z.string().min(14).max(128),
    mfaCode: z.string().regex(/^\d{6}$/u),
  });
export const invitationAcceptanceResponseSchema = z.object({
  recoveryCodes: z.array(recoveryCodeSchema).length(8),
});
export const stepUpRequestSchema = z.object({
  mfaCode: z.string().regex(/^\d{6}$/u),
});
export const stepUpResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.literal(300),
});
export type AdministratorInvitationRequest = z.infer<
  typeof administratorInvitationRequestSchema
>;
export type AdministratorInvitationResponse = z.infer<
  typeof administratorInvitationResponseSchema
>;
export type InvitationSetupResponse = z.infer<
  typeof invitationSetupResponseSchema
>;
export type InvitationAcceptanceResponse = z.infer<
  typeof invitationAcceptanceResponseSchema
>;
export type StepUpResponse = z.infer<typeof stepUpResponseSchema>;
export const authenticationEventTypes = [
  "login_succeeded",
  "login_failed",
  "session_refreshed",
  "session_revoked",
  "refresh_token_reuse",
  "role_changed",
  "password_changed",
  "mfa_challenged",
  "mfa_recovered",
  "recovery_codes_rotated",
  "user_disabled",
  "user_enabled",
  "user_invited",
  "invitation_accepted",
  "privileged_data_read",
  "hardware_key_enrolled",
  "hardware_key_authenticated",
  "hardware_key_revoked",
] as const;
export const authenticationAuditItemSchema = z.object({
  eventId: z.string().min(1).max(128),
  type: z.enum(authenticationEventTypes),
  actorId: z.string().min(1).max(128).optional(),
  subjectId: z.string().min(1).max(128).optional(),
  occurredAt: z.coerce.date(),
  outcome: z.enum(["success", "failure"]),
  reason: z.string().min(1).max(128).optional(),
});
export const authenticationAuditPageSchema = z.object({
  items: z.array(authenticationAuditItemSchema).max(100),
  nextCursor: z.string().min(1).max(512).optional(),
});
export type AuthenticationAuditItem = z.infer<
  typeof authenticationAuditItemSchema
>;
export type AuthenticationAuditPage = z.infer<
  typeof authenticationAuditPageSchema
>;
export const authenticationAuditIntegritySchema = z.object({
  status: z.enum(["valid", "invalid", "incomplete"]),
  checkedEvents: z.number().int().nonnegative().max(10_000),
  headHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
});
export type AuthenticationAuditIntegrity = z.infer<
  typeof authenticationAuditIntegritySchema
>;
export const mfaEncryptionStatusSchema = z.object({
  checkedAt: z.coerce.date(),
  checkedRecords: z.number().int().nonnegative().max(1_000),
  activeKeyRecords: z.number().int().nonnegative().max(1_000),
  retiringKeyRecords: z.number().int().nonnegative().max(1_000),
  unreadableRecords: z.number().int().nonnegative().max(1_000),
  configuredRetiringKeys: z.number().int().nonnegative().max(2),
  truncated: z.boolean(),
  safeToRetire: z.boolean(),
});
export type MfaEncryptionStatus = z.infer<typeof mfaEncryptionStatusSchema>;

export const contentKinds = [
  "identity",
  "atlasNode",
  "speakingTheme",
  "signal",
  "archiveItem",
  "source",
  "scholar",
  "officeHoursCycle",
  "officeHoursAnswer",
  "selahEntry",
  "riderTemplate",
  "emailTemplate",
  "page",
  "blackout",
  "counterparty",
  "deskConfiguration",
] as const;
export const contentKindSchema = z.enum(contentKinds);
export type ContentKind = z.infer<typeof contentKindSchema>;

export const workflowStates = [
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "superseded",
] as const;
export const workflowStateSchema = z.enum(workflowStates);
export const workflowActions = [
  "submit",
  "request_changes",
  "approve",
  "schedule",
  "supersede",
] as const;
export const workflowActionSchema = z.enum(workflowActions);
export type WorkflowAction = z.infer<typeof workflowActionSchema>;

export const contentVersionSchema = z.object({
  documentType: contentKindSchema,
  documentId: z.string().min(1),
  version: z.number().int().positive(),
  state: workflowStateSchema,
  authorId: z.string().min(1),
  reviewerId: z.string().min(1).optional(),
  approvedAt: z.coerce.date().optional(),
  scheduledFor: z.coerce.date().optional(),
  payload: z.unknown(),
});
export const contentVersionsSchema = z.array(contentVersionSchema);
export type ContentVersion = z.infer<typeof contentVersionSchema>;

export const contentDocumentSummarySchema = z.object({
  documentType: contentKindSchema,
  documentId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u),
  latestVersion: z.number().int().positive(),
  state: workflowStateSchema,
  updatedAt: z.coerce.date(),
});
export const contentDocumentPageSchema = z.object({
  items: z.array(contentDocumentSummarySchema),
  nextCursor: z.string().optional(),
});
export type ContentDocumentSummary = z.infer<
  typeof contentDocumentSummarySchema
>;
export type ContentDocumentPage = z.infer<typeof contentDocumentPageSchema>;

export const cmsCreateDraftRequestSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});
export const cmsTransitionRequestSchema = z.object({
  action: workflowActionSchema,
  policySensitive: z.boolean().optional(),
  scheduledFor: z.iso.datetime().optional(),
});
export const cmsPublishRequestSchema = z.object({
  locale: z.enum(["en-GB", "fr-FR"]),
});

export const publicationSchema = z.object({
  documentType: contentKindSchema,
  documentId: z.string().min(1),
  locale: z.enum(["en-GB", "fr-FR"]),
  version: z.number().int().positive(),
  publishedAt: z.coerce.date(),
});
export type Publication = z.infer<typeof publicationSchema>;

export const unpublicationSchema = z.object({
  documentType: contentKindSchema,
  documentId: z.string().min(1),
  locale: z.enum(["en-GB", "fr-FR"]),
  version: z.number().int().positive(),
  unpublishedAt: z.coerce.date(),
});
export type Unpublication = z.infer<typeof unpublicationSchema>;

export const editorialAuditEventSchema = z.object({
  eventId: z.string().min(1),
  documentType: z.string().min(1),
  documentId: z.string().min(1),
  version: z.number().int().positive().optional(),
  actorId: z.string().min(1),
  action: z.string().min(1),
  sequence: z.number().int().positive(),
  occurredAt: z.coerce.date(),
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  changes: z.array(
    z.object({
      path: z.string().startsWith("/"),
      before: z.unknown().optional(),
      after: z.unknown().optional(),
    }),
  ),
  previousEventHash: z.string().optional(),
  eventHash: z.string().min(1),
});
export const editorialAuditEventsSchema = z.array(editorialAuditEventSchema);
export type EditorialAuditEvent = z.infer<typeof editorialAuditEventSchema>;

export const editorialAuditIntegritySchema = z.object({
  status: z.enum(["valid", "invalid", "incomplete"]),
  checkedEvents: z.number().int().nonnegative(),
  headSequence: z.number().int().positive().optional(),
  reason: z.string().optional(),
});
export type EditorialAuditIntegrity = z.infer<
  typeof editorialAuditIntegritySchema
>;

export const auditExportSchema = z.object({
  format: z.literal("amanor-editorial-audit-v2"),
  generatedAt: z.coerce.date(),
  documentType: contentKindSchema,
  documentId: z.string().min(1),
  events: editorialAuditEventsSchema,
  integrity: editorialAuditIntegritySchema,
});
export type AuditExport = z.infer<typeof auditExportSchema>;

export const publicContentProjectionSchema = z.object({
  documentType: z.string().min(1),
  documentId: z.string().min(1),
  locale: z.enum(["en-GB", "fr-FR"]),
  version: z.number().int().positive(),
  publishedAt: z.coerce.date(),
  payload: z.unknown(),
  translation: z.object({
    stale: z.boolean(),
    sourceUpdatedAt: z.coerce.date().optional(),
  }),
});

export type PublicContentProjection = z.infer<
  typeof publicContentProjectionSchema
>;

export const publicSourceSchema = z.object({
  ref: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: httpsUrlSchema.optional(),
  accessedAt: z.coerce.date(),
  type: z.enum(["cv", "press", "official", "firstParty"]),
});
export const publicSourcePageSchema = z.object({
  items: z.array(publicSourceSchema),
  nextCursor: z.string().optional(),
});
export type PublicSource = z.infer<typeof publicSourceSchema>;
export type PublicSourcePage = z.infer<typeof publicSourcePageSchema>;

export const revalidationRequestSchema = z.object({
  idempotencyKey: z.string().min(1).max(256),
  tags: z.array(z.string().min(1).max(256)).min(1).max(20),
});

export type RevalidationRequest = z.infer<typeof revalidationRequestSchema>;

export function revalidationSigningPayload(
  keyId: string,
  audience: string,
  timestamp: string,
  rawBody: string,
): string {
  return ["amanor-revalidation-v1", keyId, audience, timestamp, rawBody].join(
    "\n",
  );
}

export const mediaFolders = [
  "portraits",
  "atlas",
  "archive",
  "speaking",
  "scholars",
  "press",
] as const;
export const mediaResourceTypes = ["image", "video", "raw"] as const;
export const mediaTransformationPolicies = [
  "portrait",
  "editorial",
  "atlas",
  "document",
] as const;
export const mediaRetentionPolicies = [
  "standard",
  "permanent",
  "expires",
] as const;
export const mediaSignRequestSchema = z.object({
  folder: z.enum(mediaFolders),
  resourceType: z.enum(mediaResourceTypes),
});
export const signedMediaUploadSchema = z.object({
  cloudName: z.string().min(1),
  apiKey: z.string().min(1),
  timestamp: z.number().int().positive(),
  folder: z.string().startsWith("amanor/"),
  resourceType: z.enum(mediaResourceTypes),
  signature: z.string().min(1),
  uploadUrl: httpsUrlSchema,
  overwrite: z.literal(false),
  uniqueFilename: z.literal(true),
});
const localizedMediaTextSchema = z.object({
  "en-GB": z.string().trim().min(1),
  "fr-FR": z.string(),
  status: z.object({
    "en-GB": z.enum(["current", "stale", "missing"]),
    "fr-FR": z.enum(["current", "stale", "missing"]),
  }),
  sourceUpdatedAt: z.coerce.date(),
});
export const mediaCompleteRequestSchema = z.object({
  publicId: z.string().min(1),
  resourceType: z.enum(mediaResourceTypes),
  altText: localizedMediaTextSchema,
  credit: z.string().min(1),
  sourceRef: z.string().min(1),
  consentReference: z.string().min(1).optional(),
  licence: z.string().min(1),
  transformationPolicy: z.enum(mediaTransformationPolicies),
  focalPoint: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .optional(),
  retentionPolicy: z.enum(mediaRetentionPolicies),
  retainUntil: z.coerce.date().optional(),
  legalHold: z.boolean(),
});
export const mediaAssetSchema = mediaCompleteRequestSchema.extend({
  assetId: z.string().uuid(),
  secureUrl: httpsUrlSchema,
  format: z.string(),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  version: z.number().int().nonnegative(),
  status: z.enum(["active", "deleted", "quarantined"]),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedBy: z.string().optional(),
  updatedAt: z.coerce.date().optional(),
});
export const mediaMetadataUpdateSchema = mediaCompleteRequestSchema
  .pick({
    altText: true,
    credit: true,
    sourceRef: true,
    consentReference: true,
    licence: true,
    transformationPolicy: true,
    focalPoint: true,
    retentionPolicy: true,
    retainUntil: true,
    legalHold: true,
  })
  .strict();
export const mediaAssetListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(512).optional(),
  assetId: z.string().uuid().optional(),
  folder: z.enum(mediaFolders).optional(),
  resourceType: z.enum(mediaResourceTypes).optional(),
});
export const mediaAssetPageSchema = z.object({
  items: z.array(mediaAssetSchema),
  nextCursor: z.string().optional(),
});
export const mediaInventoryGapSchema = z.enum([
  "french_alt_missing",
  "french_alt_stale",
  "consent_reference_missing",
  "image_focal_point_missing",
  "expiry_date_missing",
  "expired_active_asset",
]);
export const mediaInventoryItemSchema = mediaAssetSchema.extend({
  folder: z.enum(mediaFolders),
  publishedReference: z.boolean(),
  governanceStatus: z.enum(["ready", "action_required"]),
  gaps: z.array(mediaInventoryGapSchema),
});
export const mediaInventoryReportSchema = z.object({
  generatedAt: z.coerce.date(),
  totals: z.object({
    assets: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
    actionRequired: z.number().int().nonnegative(),
  }),
  items: z.array(mediaInventoryItemSchema).max(10_000),
});
export type MediaSignRequest = z.infer<typeof mediaSignRequestSchema>;
export type SignedMediaUpload = z.infer<typeof signedMediaUploadSchema>;
export type MediaCompleteRequest = z.infer<typeof mediaCompleteRequestSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type MediaMetadataUpdate = z.infer<typeof mediaMetadataUpdateSchema>;
export type MediaAssetListQuery = z.infer<typeof mediaAssetListQuerySchema>;
export type MediaAssetPage = z.infer<typeof mediaAssetPageSchema>;
export type MediaInventoryReport = z.infer<typeof mediaInventoryReportSchema>;

export const sourceAuditClaimSchema = z.object({
  documentType: z.string().min(1),
  documentId: z.string().min(1),
  locale: z.enum(["en-GB", "fr-FR"]),
  version: z.number().int().positive(),
  sourceRefs: z.array(z.string().min(1)),
  missingSourceRefs: z.array(z.string().min(1)),
});
export const sourceAuditEntrySchema = z.object({
  documentId: z.string().min(1),
  ref: z.string().min(1),
  locales: z.array(z.enum(["en-GB", "fr-FR"])).min(1),
  dependentPublications: z.number().int().nonnegative(),
  status: z.enum(["used", "unused", "duplicate_ref"]),
});
export const sourceAuditReportSchema = z.object({
  generatedAt: z.coerce.date(),
  totals: z.object({
    publications: z.number().int().nonnegative(),
    sourceEntries: z.number().int().nonnegative(),
    claimReferences: z.number().int().nonnegative(),
    missingReferences: z.number().int().nonnegative(),
    unusedSources: z.number().int().nonnegative(),
    duplicateReferences: z.number().int().nonnegative(),
  }),
  sources: z.array(sourceAuditEntrySchema).max(10_000),
  claims: z.array(sourceAuditClaimSchema).max(10_000),
});
export type SourceAuditReport = z.infer<typeof sourceAuditReportSchema>;

export const publicMediaSchema = z.object({
  assetId: z.string().uuid(),
  secureUrl: httpsUrlSchema,
  resourceType: z.enum(mediaResourceTypes),
  format: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  bytes: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  altText: z.string().min(1),
  credit: z.string().min(1),
  licence: z.string().min(1),
  sourceRef: z.string().min(1),
  focalPoint: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .optional(),
});
export type PublicMedia = z.infer<typeof publicMediaSchema>;

export const pressKitRequestSchema = z.object({
  requesterName: z.string().trim().min(2).max(100),
  outlet: z.string().trim().min(2).max(160),
  email: z.email().max(254),
  locale: z.enum(["en-GB", "fr-FR"]),
  format: z.enum(["pdf", "zip"]),
});
export type PressKitRequest = z.infer<typeof pressKitRequestSchema>;

export const livingDossierRequestSchema = z.object({
  requesterName: z.string().trim().min(2).max(100),
  organisation: z.string().trim().min(2).max(160),
  email: z.email().max(254),
  purpose: z.string().trim().min(10).max(500),
  variant: z.enum(["speaker", "institutional", "full"]),
  locale: z.enum(["en-GB", "fr-FR"]),
});
export type LivingDossierRequest = z.infer<typeof livingDossierRequestSchema>;

export const mediaEnquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  outlet: z.string().trim().min(2).max(160),
  email: z.email().max(254),
  deadline: z.iso.datetime().optional(),
  subject: z.string().trim().min(4).max(160),
  message: z.string().trim().min(20).max(4000),
  locale: z.enum(["en-GB", "fr-FR"]),
});
export type MediaEnquiry = z.infer<typeof mediaEnquirySchema>;

export const contactCategories = [
  "general",
  "correction",
  "accessibility",
  "website",
  "other",
] as const;
export const contactEnquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  organisation: z.string().trim().min(2).max(160).optional(),
  category: z.enum(contactCategories),
  subject: z.string().trim().min(4).max(160),
  message: z.string().trim().min(20).max(4000),
  locale: z.enum(["en-GB", "fr-FR"]),
  privacyConsent: z.literal(true),
});
export type ContactEnquiry = z.infer<typeof contactEnquirySchema>;

export const publicAtlasNodeSchema = z.object({
  slug: z.string(),
  label: z.string(),
  institution: z.string(),
  role: z.string(),
  country: z.string(),
  city: z.string().optional(),
  coordinates: z.tuple([z.number(), z.number()]).optional(),
  region: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable(),
  era: z.string(),
  themes: z.array(z.string()),
  portfolioValue: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  valueYear: z.number().int().optional(),
  valueType: z.enum(["managed", "raised", "designed"]).optional(),
  outcomes: z.array(z.string()),
  sourceRefs: z.array(z.string()),
  image: z.string().uuid().optional(),
  relatedArchive: z.array(z.string()).optional(),
  homepageProof: z
    .object({
      order: z.number().int().min(1).max(9),
      label: z.string().trim().min(1),
      emphasisFor: z
        .array(
          z.enum(["government", "investor", "media", "youth", "philanthropy"]),
        )
        .max(5)
        .optional(),
    })
    .optional(),
  homepageAct: z
    .object({
      act: z.enum(["forest", "system", "bridge", "architecture"]),
      label: z.string().trim().min(1),
      dateRange: z.string().trim().min(1),
      place: z.string().trim().min(1),
      figure: z.string().trim().min(1),
      sentence: z.string().trim().min(1),
    })
    .optional(),
});
export const publicAtlasSchema = z.object({
  items: z.array(publicAtlasNodeSchema).max(60),
  translation: z.object({
    stale: z.boolean(),
    sourceUpdatedAt: z.coerce.date().optional(),
  }),
});
export type PublicAtlasNode = z.infer<typeof publicAtlasNodeSchema>;
export type PublicAtlas = z.infer<typeof publicAtlasSchema>;

export const publicArchiveItemSchema = z.object({
  documentId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  title: z.string().trim().min(1),
  type: z.enum(["speech", "interview", "panel", "article", "broadcast"]),
  date: z.coerce.date(),
  publishedAt: z.coerce.date(),
  language: z.enum(["en", "fr"]),
  venue: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  mediaUrl: httpsUrlSchema.optional(),
  transcript: z.string().optional(),
  transcriptStatus: z.enum(["machine", "corrected"]),
  transcriptSegments: z
    .array(
      z.object({
        startSeconds: z.number().int().nonnegative(),
        text: z.string().trim().min(1),
      }),
    )
    .max(500)
    .optional(),
  chapters: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
        label: z.string().trim().min(1),
        startSeconds: z.number().int().nonnegative(),
        endSeconds: z.number().int().positive().optional(),
      }),
    )
    .max(100)
    .optional(),
  corrections: z
    .array(
      z.object({
        incorrectQuote: z.string().trim().min(1),
        correction: z.string().trim().min(1),
        issuedAt: z.coerce.date(),
        sourceRef: z.string().trim().min(1),
      }),
    )
    .max(50)
    .optional(),
});
export const publicArchiveSchema = z.object({
  items: z.array(publicArchiveItemSchema).max(50),
  translation: z.object({
    stale: z.boolean(),
    sourceUpdatedAt: z.coerce.date().optional(),
  }),
});
export type PublicArchiveItem = z.infer<typeof publicArchiveItemSchema>;
export type PublicArchive = z.infer<typeof publicArchiveSchema>;

export const speakingFormats = [
  "keynote",
  "plenary_panel",
  "fireside",
  "institutional_briefing",
  "media_interview",
  "academic_lecture",
  "youth_address",
  "workshop",
] as const;
export const publicSpeakingThemeSchema = z.object({
  documentId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  audiences: z.array(z.string().trim().min(1)).min(1),
  formats: z.array(z.enum(speakingFormats)).min(1),
  sourceRefs: z.array(z.string().trim().min(1)).min(1),
  relatedNodes: z
    .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u))
    .default([]),
  featured: z.boolean(),
  publishedAt: z.coerce.date(),
  history: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
        title: z.string().trim().min(1),
        host: z.string().trim().min(1),
        date: z.coerce.date(),
        city: z.string().optional(),
        country: z.string().trim().min(2),
        format: z.enum(speakingFormats),
        sourceRefs: z.array(z.string().trim().min(1)).min(1),
      }),
    )
    .min(2)
    .max(50),
  media: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        kind: z.enum(["image", "video"]),
        caption: z.string().trim().min(1),
        relatedArchive: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
          .optional(),
        sourceRef: z.string().trim().min(1),
      }),
    )
    .max(12)
    .optional(),
});
export const publicSpeakingSchema = z.object({
  items: z.array(publicSpeakingThemeSchema).max(50),
  translation: z.object({
    stale: z.boolean(),
    sourceUpdatedAt: z.coerce.date().optional(),
  }),
});
export type PublicSpeakingTheme = z.infer<typeof publicSpeakingThemeSchema>;
export type PublicSpeaking = z.infer<typeof publicSpeakingSchema>;

export const publicSignalSchema = z.object({
  documentId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  body: z.string().trim().min(1),
  publishedAt: z.coerce.date(),
  tags: z.array(z.string().trim().min(1)).min(1).max(3),
  confidence: z.enum(["watching", "expecting", "callingIt"]),
  changeMyMind: z.string().trim().min(1),
  sourceRefs: z.array(z.string().trim().min(1)).min(1),
  reviewDue: z.coerce.date().optional(),
  resolution: z.enum(["heldUp", "partly", "didNot", "tooEarly"]).optional(),
  resolutionNote: z.string().trim().min(1).optional(),
  resolvedAt: z.coerce.date().optional(),
  translation: z.object({
    stale: z.boolean(),
    sourceUpdatedAt: z.coerce.date().optional(),
  }),
});
export type PublicSignal = z.infer<typeof publicSignalSchema>;
export const publicSignalsSchema = z.object({
  items: z.array(publicSignalSchema.omit({ translation: true })).max(50),
  translation: z.object({
    stale: z.boolean(),
    sourceUpdatedAt: z.coerce.date().optional(),
  }),
});
export type PublicSignals = z.infer<typeof publicSignalsSchema>;

export const publicScholarSchema = z
  .object({
    documentId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u),
    name: z.string().trim().min(1),
    country: z.string().trim().min(2),
    institution: z.string().trim().min(1),
    field: z.string().trim().min(1),
    cohortYear: z.number().int().min(2000).max(2200),
    status: z.string().trim().min(1),
    photo: z.string().uuid().optional(),
    story: z.string().trim().min(1),
    publishedAt: z.coerce.date(),
  })
  .strict();
export const publicLegacySchema = z.object({
  scholars: z.array(publicScholarSchema).max(100),
  translation: z.object({
    stale: z.boolean(),
    sourceUpdatedAt: z.coerce.date().optional(),
  }),
});
export type PublicScholar = z.infer<typeof publicScholarSchema>;
export type PublicLegacy = z.infer<typeof publicLegacySchema>;

export const protocolDeskStates = [
  "received",
  "screened",
  "awaiting_decision",
  "info_requested",
  "held",
  "accepted",
  "contracted",
  "delivered",
  "declined",
  "lapsed",
  "archived",
] as const;
export const protocolDeskFlagTypes = [
  "conflict",
  "lead_time",
  "unverified",
  "clash",
  "sensitivity",
  "repeat_requester",
] as const;
export const protocolDeskQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(500).optional(),
  q: z.string().trim().max(120).optional(),
  state: z.enum(protocolDeskStates).optional(),
  capacity: z.enum(["official", "personal", "unsure"]).optional(),
  flag: z.enum(protocolDeskFlagTypes).optional(),
});
export const protocolDeskQueueItemSchema = z.object({
  requestId: z.string().uuid(),
  reference: z.string(),
  state: z.enum(protocolDeskStates),
  capacity: z.enum(["official", "personal", "unsure"]),
  organisationName: z.string(),
  organisationType: z.string(),
  eventName: z.string(),
  engagementType: z.string(),
  startsAt: z.coerce.date(),
  country: z.string(),
  locale: z.enum(["en-GB", "fr-FR"]),
  triageScore: z.number().int().min(0).max(100).nullable(),
  flags: z.array(
    z.object({
      flagId: z.string().uuid(),
      type: z.enum(protocolDeskFlagTypes),
      severity: z.enum(["notice", "review", "blocking"]),
      detail: z.string(),
    }),
  ),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export const protocolDeskQueuePageSchema = z.object({
  items: z.array(protocolDeskQueueItemSchema),
  nextCursor: z.string().optional(),
});
export type ProtocolDeskQueueQuery = z.infer<
  typeof protocolDeskQueueQuerySchema
>;
export type ProtocolDeskQueueItem = z.infer<typeof protocolDeskQueueItemSchema>;
export type ProtocolDeskQueuePage = z.infer<typeof protocolDeskQueuePageSchema>;
export const protocolDeskAssignmentSchema = z.object({
  assigneeId: z.string().trim().min(1).max(128),
});
export const protocolDeskNoteInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export const protocolDeskDeclineCategories = [
  "capacity",
  "fit",
  "conflict",
] as const;
export const principalDecisionActions = [
  "accept",
  "decline",
  "hold",
  "request_information",
] as const;
export const principalDecisionIssueSchema = z.object({
  action: z.enum(principalDecisionActions),
});
export const principalDecisionInputSchema = z
  .object({
    token: z.string().min(40).max(128),
    action: z.enum(principalDecisionActions),
    reason: z.string().trim().min(1).max(1000),
    declineCategory: z.enum(protocolDeskDeclineCategories).optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "decline" && !value.declineCategory)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["declineCategory"],
        message: "A decline category is required",
      });
    if (value.action !== "decline" && value.declineCategory)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["declineCategory"],
        message: "A decline category applies only to a decline",
      });
  });
export type PrincipalDecisionInput = z.infer<
  typeof principalDecisionInputSchema
>;
export const principalDecisionResponseSchema = z.object({
  reference: z.string().regex(/^PD-[0-9]{4}-[0-9]{4,}$/u),
  state: z.enum(["accepted", "declined", "held", "info_requested"]),
});
export type PrincipalDecisionResponse = z.infer<
  typeof principalDecisionResponseSchema
>;
export const protocolDeskTransitionInputSchema = z
  .object({
    state: z.enum(protocolDeskStates),
    reason: z.string().trim().min(1).max(1000),
    declineCategory: z.enum(protocolDeskDeclineCategories).optional(),
  })
  .superRefine((value, context) => {
    if (value.state === "declined" && !value.declineCategory)
      context.addIssue({
        code: "custom",
        path: ["declineCategory"],
        message: "A decline category is required for declined requests",
      });
    if (value.state !== "declined" && value.declineCategory)
      context.addIssue({
        code: "custom",
        path: ["declineCategory"],
        message: "A decline category is only valid for declined requests",
      });
  });
export const protocolDeskFlagClearanceSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export const protocolNoteInputSchema = z.object({
  speakerContactName: z.string().trim().min(2).max(120),
  speakerContactEmail: z.email().max(254),
  technicalRequirements: z
    .array(z.string().trim().min(1).max(500))
    .max(12)
    .default([]),
  logistics: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  accessibilityRequirements: z
    .array(z.string().trim().min(1).max(500))
    .max(12)
    .default([]),
  arrivalTime: z.string().trim().max(120).optional(),
  briefingWindow: z.string().trim().max(240).optional(),
  rehearsalRequirement: z.string().trim().max(240).optional(),
  displayRequirements: z.string().trim().max(500).optional(),
  lecternRequired: z.boolean().optional(),
});
const protocolDeskEventSchema = z.object({
  eventId: z.string().uuid(),
  requestId: z.string().uuid(),
  category: z.enum(["action", "access"]),
  fromState: z.enum(protocolDeskStates).nullable(),
  toState: z.enum(protocolDeskStates),
  actorId: z.string(),
  actorRole: z.string(),
  reason: z.string(),
  occurredAt: z.coerce.date(),
});
const protocolDeskNoteSchema = z.object({
  noteId: z.string().uuid(),
  requestId: z.string().uuid(),
  body: z.string(),
  authorId: z.string(),
  authorRole: z.enum(["principal", "desk_officer"]),
  createdAt: z.coerce.date(),
});
export const protocolDeskCorrespondenceTemplates = [
  "acknowledgement",
  "status-update",
  "information-request",
  "hold-placed",
  "acceptance",
  "decline-capacity",
  "decline-fit",
  "decline-conflict",
  "follow-up",
] as const;
export const protocolDeskCorrespondenceSchema = z.object({
  correspondenceId: z.string().uuid(),
  template: z.enum(protocolDeskCorrespondenceTemplates),
  locale: z.enum(["en-GB", "fr-FR"]),
  status: z.enum(["pending", "processing", "delivered", "failed", "cancelled"]),
  attempts: z.number().int().nonnegative(),
  availableAt: z.coerce.date(),
  deliveredAt: z.coerce.date().optional(),
  providerMessageId: z.string().optional(),
  lastError: z.string().optional(),
});
export const protocolDeskCalendarSyncSchema = z.object({
  syncId: z.string().uuid(),
  operation: z.literal("upsert"),
  status: z.enum(["pending", "processing", "failed", "completed"]),
  attempts: z.number().int().nonnegative(),
  availableAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  providerEventId: z.string().max(200).optional(),
  payloadHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
  lastError: z.string().max(200).optional(),
});
export const protocolDeskPrincipalDecisionDeliverySchema = z.object({
  deliveryId: z.string().uuid(),
  status: z.enum(["pending", "processing", "delivered", "failed", "cancelled"]),
  attempts: z.number().int().nonnegative(),
  availableAt: z.coerce.date(),
  deliveredAt: z.coerce.date().optional(),
});
export const protocolDeskRequestDetailSchema = z.object({
  request: protocolDeskQueueItemSchema.extend({
    requester: z.object({
      name: z.string(),
      role: z.string(),
      email: z.email(),
      phone: z.string().optional(),
    }),
    objective: z.string(),
    audienceDescription: z.string(),
    contactName: z.string(),
    contactPhone: z.string(),
    triageDimensions: z.array(
      z.object({
        key: z.string(),
        score: z.number(),
        weight: z.number(),
        factors: z.array(z.string()),
      }),
    ),
    assignedTo: z.string().optional(),
    assignedAt: z.coerce.date().optional(),
    assignedBy: z.string().optional(),
    protocolNoteConfiguration: protocolNoteInputSchema
      .extend({
        configuredAt: z.coerce.date(),
        configuredBy: z.string(),
      })
      .optional(),
    flags: z.array(
      z.object({
        flagId: z.string().uuid(),
        type: z.enum(protocolDeskFlagTypes),
        severity: z.enum(["notice", "review", "blocking"]),
        detail: z.string(),
        raisedAt: z.coerce.date(),
        clearedAt: z.coerce.date().optional(),
        clearedBy: z.string().optional(),
        clearanceReason: z.string().optional(),
      }),
    ),
  }),
  nextStates: z.array(z.enum(protocolDeskStates)),
  events: z.array(protocolDeskEventSchema),
  notes: z.array(protocolDeskNoteSchema),
  correspondence: z.array(protocolDeskCorrespondenceSchema),
  calendarSync: z.array(protocolDeskCalendarSyncSchema).max(1).default([]),
  principalDecisionDelivery: z
    .array(protocolDeskPrincipalDecisionDeliverySchema)
    .max(1)
    .default([]),
});
export type ProtocolDeskAssignment = z.infer<
  typeof protocolDeskAssignmentSchema
>;
export type ProtocolDeskNoteInput = z.infer<typeof protocolDeskNoteInputSchema>;
export type ProtocolDeskTransitionInput = z.infer<
  typeof protocolDeskTransitionInputSchema
>;
export type ProtocolDeskFlagClearance = z.infer<
  typeof protocolDeskFlagClearanceSchema
>;
export type ProtocolNoteInput = z.infer<typeof protocolNoteInputSchema>;
export type ProtocolDeskRequestDetail = z.infer<
  typeof protocolDeskRequestDetailSchema
>;
export const protocolDeskEscalationSchema = z.object({
  escalationId: z.string().uuid(),
  type: z.enum(["initial_response_overdue", "delivery_failure"]),
  severity: z.enum(["ticket", "page"]),
  requestId: z.string().uuid(),
  reference: z.string(),
  correspondenceId: z.string().uuid(),
  openedAt: z.coerce.date(),
  dueAt: z.coerce.date(),
  attempts: z.number().int().nonnegative(),
});
export const protocolDeskOperationsSchema = z.object({
  generatedAt: z.coerce.date(),
  requestsByState: z.partialRecord(
    z.enum(protocolDeskStates),
    z.number().int().nonnegative(),
  ),
  openEscalations: z.array(protocolDeskEscalationSchema).max(100),
  overdueInitialResponses: z.number().int().nonnegative(),
  failedCorrespondence: z.number().int().nonnegative(),
  pendingCorrespondence: z.number().int().nonnegative(),
  failedCalendarSync: z.number().int().nonnegative(),
  pendingCalendarSync: z.number().int().nonnegative(),
  failedPrincipalDecisionDeliveries: z.number().int().nonnegative(),
  pendingPrincipalDecisionDeliveries: z.number().int().nonnegative(),
  oldestPendingSeconds: z.number().nonnegative(),
});
export type ProtocolDeskOperations = z.infer<
  typeof protocolDeskOperationsSchema
>;
export const protocolDeskAvailabilityQuerySchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    excludeRequestId: z.string().uuid().optional(),
  })
  .superRefine((value, context) => {
    if (value.endsAt <= value.startsAt)
      context.addIssue({
        code: "custom",
        message: "Availability end must follow start",
      });
    if (value.endsAt.getTime() - value.startsAt.getTime() > 31 * 86_400_000)
      context.addIssue({
        code: "custom",
        message: "Availability window cannot exceed 31 days",
      });
  });
export const protocolDeskAvailabilitySchema = z.object({
  available: z.boolean(),
  checkedAt: z.coerce.date(),
  conflicts: z.array(
    z.object({
      type: z.enum(["blackout", "engagement"]),
      reference: z.string(),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      reason: z.string(),
    }),
  ),
});
export type ProtocolDeskAvailabilityQuery = z.infer<
  typeof protocolDeskAvailabilityQuerySchema
>;
export type ProtocolDeskAvailability = z.infer<
  typeof protocolDeskAvailabilitySchema
>;

export * from "./room.js";
export * from "./room-crypto.js";
