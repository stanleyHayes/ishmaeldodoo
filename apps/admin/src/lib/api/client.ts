import {
  adminSessionsResponseSchema,
  administratorRolesUpdateSchema,
  administratorStatusUpdateSchema,
  administratorSummarySchema,
  administratorsResponseSchema,
  administratorInvitationRequestSchema,
  administratorInvitationResponseSchema,
  invitationSetupRequestSchema,
  invitationSetupResponseSchema,
  invitationAcceptanceRequestSchema,
  invitationAcceptanceResponseSchema,
  stepUpRequestSchema,
  stepUpResponseSchema,
  authenticationAuditPageSchema,
  authenticationAuditIntegritySchema,
  auditExportSchema,
  apiErrorSchema,
  authSessionResponseSchema,
  loginRequestSchema,
  type AdminSession,
  type AdministratorRolesUpdate,
  type AdministratorSummary,
  type AdministratorInvitationRequest,
  type AdministratorInvitationResponse,
  type InvitationSetupResponse,
  type InvitationAcceptanceResponse,
  type StepUpResponse,
  type AuthenticationAuditPage,
  type AuthenticationAuditIntegrity,
  type AuditExport,
  type AuthSessionResponse,
  type LoginRequest,
  type ApiOperations,
  cmsCreateDraftRequestSchema,
  cmsPublishRequestSchema,
  cmsTransitionRequestSchema,
  contentKindSchema,
  contentDocumentPageSchema,
  contentVersionSchema,
  contentVersionsSchema,
  editorialAuditEventsSchema,
  editorialAuditIntegritySchema,
  mediaAssetSchema,
  mediaAssetPageSchema,
  mediaInventoryReportSchema,
  sourceAuditReportSchema,
  mediaAssetListQuerySchema,
  mediaCompleteRequestSchema,
  mediaMetadataUpdateSchema,
  mediaSignRequestSchema,
  signedMediaUploadSchema,
  type MediaAsset,
  type MediaAssetListQuery,
  type MediaAssetPage,
  type MediaCompleteRequest,
  type MediaMetadataUpdate,
  type MediaSignRequest,
  type SignedMediaUpload,
  publicationSchema,
  unpublicationSchema,
  type ContentKind,
  type ContentDocumentPage,
  type ContentVersion,
  type EditorialAuditEvent,
  type EditorialAuditIntegrity,
  type Publication,
  type Unpublication,
  type WorkflowAction,
  protocolDeskQueuePageSchema,
  protocolDeskQueueQuerySchema,
  type ProtocolDeskQueuePage,
  type ProtocolDeskQueueQuery,
  protocolDeskAssignmentSchema,
  protocolDeskNoteInputSchema,
  protocolDeskRequestDetailSchema,
  protocolDeskTransitionInputSchema,
  protocolDeskFlagClearanceSchema,
  protocolDeskOperationsSchema,
  protocolDeskAvailabilityQuerySchema,
  protocolDeskAvailabilitySchema,
  protocolNoteInputSchema,
  type ProtocolNoteInput,
  type ProtocolDeskRequestDetail,
  type ProtocolDeskTransitionInput,
  type ProtocolDeskOperations,
  type ProtocolDeskAvailability,
  type ProtocolDeskAvailabilityQuery,
  hardwareKeySummarySchema,
  hardwareKeySummariesSchema,
  webAuthnAuthenticationResponseSchema,
  webAuthnOptionsEnvelopeSchema,
  webAuthnRegistrationResponseSchema,
  type HardwareKeySummary,
  type WebAuthnOptionsEnvelope,
} from "@amanor/contracts";
import { adminApiBaseUrl } from "../env";
import { clearAuthState, getAuthState, setAuthState } from "./auth-store";

type WithoutVersionPrefix<Path extends string> =
  Path extends `/v1${infer Relative}` ? Relative : never;
const authPaths = {
  login: "/auth/login",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  sessions: "/auth/sessions",
  users: "/auth/users",
} as const satisfies {
  login: WithoutVersionPrefix<ApiOperations["AuthController_login"]["path"]>;
  refresh: WithoutVersionPrefix<
    ApiOperations["AuthController_refresh"]["path"]
  >;
  logout: WithoutVersionPrefix<ApiOperations["AuthController_logout"]["path"]>;
  sessions: WithoutVersionPrefix<
    ApiOperations["AuthController_sessions"]["path"]
  >;
  users: WithoutVersionPrefix<ApiOperations["AuthController_users"]["path"]>;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function correlatedHeaders(input?: HeadersInit): Headers {
  const headers = new Headers(input);
  if (!headers.has("X-Request-ID"))
    headers.set("X-Request-ID", crypto.randomUUID());
  if (!headers.has("traceparent")) {
    const bytes = (length: number): string =>
      Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    headers.set("traceparent", `00-${bytes(16)}-${bytes(8)}-01`);
  }
  return headers;
}

async function errorFrom(response: Response): Promise<ApiClientError> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(payload);
  return parsed.success
    ? new ApiClientError(
        parsed.data.message,
        response.status,
        parsed.data.code,
        parsed.data.requestId,
      )
    : new ApiClientError(
        "The API request failed",
        response.status,
        "UNEXPECTED_API_RESPONSE",
      );
}

let refreshInFlight: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  const current = getAuthState();
  if (!current)
    throw new ApiClientError(
      "Authentication is required",
      401,
      "AUTH_REQUIRED",
    );
  const response = await fetch(`${adminApiBaseUrl()}${authPaths.refresh}`, {
    method: "POST",
    redirect: "error",
    credentials: "include",
    headers: correlatedHeaders({ "X-CSRF-Token": current.csrfToken }),
  });
  if (!response.ok) {
    clearAuthState();
    throw await errorFrom(response);
  }
  const parsed = authSessionResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    clearAuthState();
    throw new ApiClientError(
      "The API returned an invalid authentication response",
      502,
      "INVALID_API_RESPONSE",
    );
  }
  setAuthState({
    accessToken: parsed.data.accessToken,
    csrfToken: current.csrfToken,
  });
}

async function ensureRefreshed(): Promise<void> {
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function request(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const current = getAuthState();
  const headers = correlatedHeaders(init.headers);
  if (current) headers.set("Authorization", `Bearer ${current.accessToken}`);
  if (
    current &&
    init.method &&
    !["GET", "HEAD"].includes(init.method.toUpperCase())
  ) {
    headers.set("X-CSRF-Token", current.csrfToken);
  }
  const response = await fetch(`${adminApiBaseUrl()}${path}`, {
    ...init,
    redirect: "error",
    headers,
    credentials: "include",
  });
  if (response.status === 401 && retry && current) {
    await ensureRefreshed();
    return request(path, { ...init, headers }, false);
  }
  if (!response.ok) throw await errorFrom(response);
  return response;
}

export async function login(input: LoginRequest): Promise<AuthSessionResponse> {
  const validated = loginRequestSchema.parse(input);
  const response = await fetch(`${adminApiBaseUrl()}${authPaths.login}`, {
    method: "POST",
    redirect: "error",
    credentials: "include",
    headers: correlatedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(validated),
  });
  if (!response.ok) throw await errorFrom(response);
  const parsed = authSessionResponseSchema.safeParse(await response.json());
  if (!parsed.success || !parsed.data.csrfToken) {
    throw new ApiClientError(
      "The API returned an invalid authentication response",
      502,
      "INVALID_API_RESPONSE",
    );
  }
  setAuthState({
    accessToken: parsed.data.accessToken,
    csrfToken: parsed.data.csrfToken,
  });
  return parsed.data;
}

export async function logout(): Promise<void> {
  try {
    await request(authPaths.logout, { method: "POST" }, false);
  } finally {
    clearAuthState();
  }
}

export async function listSessions(): Promise<readonly AdminSession[]> {
  const response = await request(authPaths.sessions);
  return adminSessionsResponseSchema.parse(await response.json());
}

export async function revokeSession(sessionId: string): Promise<void> {
  await request(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export async function listAdministrators(): Promise<
  readonly AdministratorSummary[]
> {
  const response = await request(authPaths.users);
  return administratorsResponseSchema.parse(await response.json());
}

export async function changeAdministratorRoles(
  userId: string,
  roles: AdministratorRolesUpdate["roles"],
): Promise<AdministratorSummary> {
  const body = administratorRolesUpdateSchema.parse({ roles });
  const response = await request(
    `/auth/users/${encodeURIComponent(userId)}/roles`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return administratorSummarySchema.parse(await response.json());
}

export async function setAdministratorDisabled(
  userId: string,
  disabled: boolean,
): Promise<AdministratorSummary> {
  const body = administratorStatusUpdateSchema.parse({ disabled });
  const response = await request(
    `/auth/users/${encodeURIComponent(userId)}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return administratorSummarySchema.parse(await response.json());
}

export async function inviteAdministrator(
  input: AdministratorInvitationRequest,
): Promise<AdministratorInvitationResponse> {
  const body = administratorInvitationRequestSchema.parse(input);
  const response = await request("/auth/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return administratorInvitationResponseSchema.parse(await response.json());
}

export async function getInvitationSetup(
  token: string,
): Promise<InvitationSetupResponse> {
  const body = invitationSetupRequestSchema.parse({ token });
  const response = await request(
    "/auth/invitations/setup",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    false,
  );
  return invitationSetupResponseSchema.parse(await response.json());
}

export async function acceptInvitation(input: {
  token: string;
  password: string;
  mfaCode: string;
}): Promise<InvitationAcceptanceResponse> {
  const body = invitationAcceptanceRequestSchema.parse(input);
  const response = await request(
    "/auth/invitations/accept",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    false,
  );
  return invitationAcceptanceResponseSchema.parse(await response.json());
}

export async function stepUp(mfaCode: string): Promise<StepUpResponse> {
  const body = stepUpRequestSchema.parse({ mfaCode });
  const current = getAuthState();
  if (!current)
    throw new ApiClientError(
      "Authentication is required",
      401,
      "AUTH_REQUIRED",
    );
  const response = await request("/auth/step-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = stepUpResponseSchema.parse(await response.json());
  setAuthState({
    accessToken: result.accessToken,
    csrfToken: current.csrfToken,
  });
  return result;
}

export async function rotateRecoveryCodes(): Promise<InvitationAcceptanceResponse> {
  const response = await request("/auth/recovery-codes/rotate", {
    method: "POST",
  });
  return invitationAcceptanceResponseSchema.parse(await response.json());
}

export async function createHardwareKeyRegistrationOptions(): Promise<WebAuthnOptionsEnvelope> {
  const response = await request("/auth/hardware-keys/registration/options", {
    method: "POST",
  });
  return webAuthnOptionsEnvelopeSchema.parse(await response.json());
}

export async function registerHardwareKey(
  input: unknown,
): Promise<HardwareKeySummary> {
  const body = webAuthnRegistrationResponseSchema.parse(input);
  const response = await request("/auth/hardware-keys/registration/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return hardwareKeySummarySchema.parse(await response.json());
}

export async function createHardwareKeyAuthenticationOptions(): Promise<WebAuthnOptionsEnvelope> {
  const response = await request("/auth/hardware-keys/authentication/options", {
    method: "POST",
  });
  return webAuthnOptionsEnvelopeSchema.parse(await response.json());
}

export async function authenticateHardwareKey(
  input: unknown,
): Promise<StepUpResponse> {
  const current = getAuthState();
  if (!current)
    throw new ApiClientError(
      "Authentication is required",
      401,
      "AUTH_REQUIRED",
    );
  const body = webAuthnAuthenticationResponseSchema.parse(input);
  const response = await request("/auth/hardware-keys/authentication/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = stepUpResponseSchema.parse(await response.json());
  setAuthState({
    accessToken: result.accessToken,
    csrfToken: current.csrfToken,
  });
  return result;
}

export async function listHardwareKeys(): Promise<
  readonly HardwareKeySummary[]
> {
  const response = await request("/auth/hardware-keys");
  return hardwareKeySummariesSchema.parse(await response.json());
}

export async function revokeHardwareKey(credentialId: string): Promise<void> {
  await request(`/auth/hardware-keys/${encodeURIComponent(credentialId)}`, {
    method: "DELETE",
  });
}

export async function listAuthenticationAudit(
  cursor?: string,
): Promise<AuthenticationAuditPage> {
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("cursor", cursor);
  const response = await request(`/auth/audit?${query.toString()}`);
  return authenticationAuditPageSchema.parse(await response.json());
}

export async function getAuthenticationAuditIntegrity(): Promise<AuthenticationAuditIntegrity> {
  const response = await request("/auth/audit/integrity");
  return authenticationAuditIntegritySchema.parse(await response.json());
}

function contentPath(documentType: ContentKind, documentId: string): string {
  return `/cms/content/${encodeURIComponent(contentKindSchema.parse(documentType))}/${encodeURIComponent(documentId)}`;
}

export async function listContentDocuments(
  documentType: ContentKind,
  cursor?: string,
): Promise<ContentDocumentPage> {
  const type = encodeURIComponent(contentKindSchema.parse(documentType));
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("cursor", cursor);
  const response = await request(`/cms/content/${type}?${query.toString()}`);
  return contentDocumentPageSchema.parse(await response.json());
}

export async function listContentVersions(
  documentType: ContentKind,
  documentId: string,
): Promise<readonly ContentVersion[]> {
  const response = await request(
    `${contentPath(documentType, documentId)}/versions`,
  );
  return contentVersionsSchema.parse(await response.json());
}

export async function createContentDraft(
  documentType: ContentKind,
  documentId: string,
  payload: Record<string, unknown>,
): Promise<ContentVersion> {
  const body = cmsCreateDraftRequestSchema.parse({ payload });
  const response = await request(
    `${contentPath(documentType, documentId)}/versions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return contentVersionSchema.parse(await response.json());
}

export async function transitionContentVersion(
  input: Readonly<{
    documentType: ContentKind;
    documentId: string;
    version: number;
    action: WorkflowAction;
    policySensitive?: boolean;
    scheduledFor?: string;
  }>,
): Promise<ContentVersion> {
  const body = cmsTransitionRequestSchema.parse({
    action: input.action,
    ...(input.policySensitive === undefined
      ? {}
      : { policySensitive: input.policySensitive }),
    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
  });
  const response = await request(
    `${contentPath(input.documentType, input.documentId)}/versions/${input.version}/actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return contentVersionSchema.parse(await response.json());
}

export async function publishContentVersion(
  input: Readonly<{
    documentType: ContentKind;
    documentId: string;
    version: number;
    locale: "en-GB" | "fr-FR";
  }>,
): Promise<Publication> {
  const body = cmsPublishRequestSchema.parse({ locale: input.locale });
  const response = await request(
    `${contentPath(input.documentType, input.documentId)}/versions/${input.version}/publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return publicationSchema.parse(await response.json());
}

export async function listContentAudit(
  documentType: ContentKind,
  documentId: string,
  limit = 100,
): Promise<readonly EditorialAuditEvent[]> {
  const response = await request(
    `${contentPath(documentType, documentId)}/audit?limit=${encodeURIComponent(limit)}`,
  );
  return editorialAuditEventsSchema.parse(await response.json());
}

export async function exportContentAudit(
  documentType: ContentKind,
  documentId: string,
): Promise<AuditExport> {
  const response = await request(
    `${contentPath(documentType, documentId)}/audit/export?limit=250`,
  );
  return auditExportSchema.parse(await response.json());
}

export async function getContentAuditIntegrity(
  documentType: ContentKind,
  documentId: string,
): Promise<EditorialAuditIntegrity> {
  const response = await request(
    `${contentPath(documentType, documentId)}/audit/integrity`,
  );
  return editorialAuditIntegritySchema.parse(await response.json());
}

export async function rollbackContentVersion(
  input: Readonly<{
    documentType: ContentKind;
    documentId: string;
    version: number;
    locale: "en-GB" | "fr-FR";
  }>,
): Promise<Publication> {
  const body = cmsPublishRequestSchema.parse({ locale: input.locale });
  const response = await request(
    `${contentPath(input.documentType, input.documentId)}/versions/${input.version}/rollback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return publicationSchema.parse(await response.json());
}

export async function unpublishContent(
  input: Readonly<{
    documentType: ContentKind;
    documentId: string;
    locale: "en-GB" | "fr-FR";
  }>,
): Promise<Unpublication> {
  const body = cmsPublishRequestSchema.parse({ locale: input.locale });
  const response = await request(
    `${contentPath(input.documentType, input.documentId)}/unpublish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return unpublicationSchema.parse(await response.json());
}

export async function signMediaUpload(
  input: MediaSignRequest,
): Promise<SignedMediaUpload> {
  const response = await request("/media/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mediaSignRequestSchema.parse(input)),
  });
  return signedMediaUploadSchema.parse(await response.json());
}

export async function listMediaAssets(
  input: Partial<MediaAssetListQuery> = {},
): Promise<MediaAssetPage> {
  const parsed = mediaAssetListQuerySchema.parse({ limit: 25, ...input });
  const query = new URLSearchParams({ limit: String(parsed.limit) });
  if (parsed.cursor) query.set("cursor", parsed.cursor);
  if (parsed.assetId) query.set("assetId", parsed.assetId);
  if (parsed.folder) query.set("folder", parsed.folder);
  if (parsed.resourceType) query.set("resourceType", parsed.resourceType);
  const response = await request(`/media/assets?${query.toString()}`);
  return mediaAssetPageSchema.parse(await response.json());
}

export async function getMediaInventory() {
  const response = await request("/media/assets/inventory");
  return mediaInventoryReportSchema.parse(await response.json());
}

export async function getSourceAuditReport() {
  const response = await request("/cms/content/source-audit/report");
  return sourceAuditReportSchema.parse(await response.json());
}

export async function registerMediaAsset(
  input: MediaCompleteRequest,
): Promise<MediaAsset> {
  const response = await request("/media/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mediaCompleteRequestSchema.parse(input)),
  });
  return mediaAssetSchema.parse(await response.json());
}

export async function updateMediaAsset(
  assetId: string,
  input: MediaMetadataUpdate,
): Promise<MediaAsset> {
  const response = await request(
    `/media/assets/${encodeURIComponent(assetId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mediaMetadataUpdateSchema.parse(input)),
    },
  );
  return mediaAssetSchema.parse(await response.json());
}

export async function uploadMediaAsset(
  file: File,
  input: Omit<MediaCompleteRequest, "publicId"> &
    Readonly<{ folder: MediaSignRequest["folder"] }>,
): Promise<MediaAsset> {
  const signed = await signMediaUpload({
    folder: input.folder,
    resourceType: input.resourceType,
  });
  const body = new FormData();
  body.set("file", file);
  body.set("api_key", signed.apiKey);
  body.set("timestamp", String(signed.timestamp));
  body.set("folder", signed.folder);
  body.set("signature", signed.signature);
  body.set("overwrite", String(signed.overwrite));
  body.set("unique_filename", String(signed.uniqueFilename));
  const upload = await fetch(signed.uploadUrl, {
    method: "POST",
    redirect: "error",
    body,
  });
  if (!upload.ok)
    throw new ApiClientError(
      "Cloudinary rejected the upload",
      upload.status,
      "MEDIA_UPLOAD_FAILED",
    );
  const payload: unknown = await upload.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("public_id" in payload) ||
    typeof payload.public_id !== "string"
  )
    throw new ApiClientError(
      "Cloudinary returned an invalid upload response",
      502,
      "INVALID_MEDIA_UPLOAD_RESPONSE",
    );
  return registerMediaAsset({
    publicId: payload.public_id,
    resourceType: input.resourceType,
    altText: input.altText,
    credit: input.credit,
    sourceRef: input.sourceRef,
    ...(input.consentReference
      ? { consentReference: input.consentReference }
      : {}),
    licence: input.licence,
    transformationPolicy: input.transformationPolicy,
    ...(input.focalPoint ? { focalPoint: input.focalPoint } : {}),
    retentionPolicy: input.retentionPolicy,
    ...(input.retainUntil ? { retainUntil: input.retainUntil } : {}),
    legalHold: input.legalHold,
  });
}

export async function deleteMediaAsset(assetId: string): Promise<void> {
  await request(`/media/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });
}

export async function listProtocolDeskQueue(
  input: Partial<ProtocolDeskQueueQuery> = {},
): Promise<ProtocolDeskQueuePage> {
  const parsed = protocolDeskQueueQuerySchema.parse({ limit: 25, ...input });
  const query = new URLSearchParams({ limit: String(parsed.limit) });
  if (parsed.cursor) query.set("cursor", parsed.cursor);
  if (parsed.q) query.set("q", parsed.q);
  if (parsed.state) query.set("state", parsed.state);
  if (parsed.capacity) query.set("capacity", parsed.capacity);
  if (parsed.flag) query.set("flag", parsed.flag);
  const response = await request(`/desk/requests?${query.toString()}`);
  return protocolDeskQueuePageSchema.parse(await response.json());
}
export async function getProtocolDeskOperations(): Promise<ProtocolDeskOperations> {
  const response = await request("/desk/requests/operations");
  return protocolDeskOperationsSchema.parse(await response.json());
}
export async function checkProtocolDeskAvailability(
  input: ProtocolDeskAvailabilityQuery,
): Promise<ProtocolDeskAvailability> {
  const parsed = protocolDeskAvailabilityQuerySchema.parse(input);
  const query = new URLSearchParams({
    startsAt: parsed.startsAt.toISOString(),
    endsAt: parsed.endsAt.toISOString(),
    ...(parsed.excludeRequestId
      ? { excludeRequestId: parsed.excludeRequestId }
      : {}),
  });
  const response = await request(`/desk/requests/availability?${query}`);
  return protocolDeskAvailabilitySchema.parse(await response.json());
}
const deskPath = (requestId: string): string =>
  `/desk/requests/${encodeURIComponent(requestId)}`;
export async function getProtocolDeskRequest(
  requestId: string,
): Promise<ProtocolDeskRequestDetail> {
  const response = await request(deskPath(requestId));
  return protocolDeskRequestDetailSchema.parse(await response.json());
}
export async function assignProtocolDeskRequest(
  requestId: string,
  assigneeId: string,
): Promise<ProtocolDeskRequestDetail> {
  const response = await request(`${deskPath(requestId)}/assignment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(protocolDeskAssignmentSchema.parse({ assigneeId })),
  });
  return protocolDeskRequestDetailSchema.parse(await response.json());
}
export async function addProtocolDeskNote(
  requestId: string,
  body: string,
): Promise<ProtocolDeskRequestDetail> {
  const response = await request(`${deskPath(requestId)}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(protocolDeskNoteInputSchema.parse({ body })),
  });
  return protocolDeskRequestDetailSchema.parse(await response.json());
}
export async function transitionProtocolDeskRequest(
  requestId: string,
  state: ProtocolDeskTransitionInput["state"],
  reason: string,
  declineCategory?: ProtocolDeskTransitionInput["declineCategory"],
): Promise<ProtocolDeskRequestDetail> {
  const response = await request(`${deskPath(requestId)}/transitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      protocolDeskTransitionInputSchema.parse({
        state,
        reason,
        declineCategory,
      }),
    ),
  });
  return protocolDeskRequestDetailSchema.parse(await response.json());
}
export async function clearProtocolDeskFlag(
  requestId: string,
  flagId: string,
  reason: string,
): Promise<ProtocolDeskRequestDetail> {
  const response = await request(
    `${deskPath(requestId)}/flags/${encodeURIComponent(flagId)}/clearance`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(protocolDeskFlagClearanceSchema.parse({ reason })),
    },
  );
  return protocolDeskRequestDetailSchema.parse(await response.json());
}
export async function retryProtocolDeskCorrespondence(
  requestId: string,
  correspondenceId: string,
): Promise<ProtocolDeskRequestDetail> {
  const response = await request(
    `${deskPath(requestId)}/correspondence/${encodeURIComponent(correspondenceId)}/retry`,
    { method: "POST" },
  );
  return protocolDeskRequestDetailSchema.parse(await response.json());
}
export async function retryProtocolDeskCalendarSync(
  requestId: string,
  syncId: string,
): Promise<ProtocolDeskRequestDetail> {
  const response = await request(
    `${deskPath(requestId)}/calendar-sync/${encodeURIComponent(syncId)}/retry`,
    { method: "POST" },
  );
  return protocolDeskRequestDetailSchema.parse(await response.json());
}
export async function retryPrincipalDecisionDelivery(
  requestId: string,
  deliveryId: string,
): Promise<ProtocolDeskRequestDetail> {
  const response = await request(
    `${deskPath(requestId)}/principal-decision-delivery/${encodeURIComponent(deliveryId)}/retry`,
    { method: "POST" },
  );
  return protocolDeskRequestDetailSchema.parse(await response.json());
}
export async function generateProtocolNote(
  requestId: string,
): Promise<Readonly<{ blob: Blob; filename: string }>> {
  const response = await request(`${deskPath(requestId)}/protocol-note`, {
    method: "POST",
  });
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename =
    /filename="([^"]+)"/u.exec(disposition)?.[1] ?? "protocol-note.pdf";
  return { blob: await response.blob(), filename };
}
export async function configureProtocolNote(
  requestId: string,
  input: ProtocolNoteInput,
): Promise<ProtocolDeskRequestDetail> {
  const response = await request(
    `${deskPath(requestId)}/protocol-note/configuration`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(protocolNoteInputSchema.parse(input)),
    },
  );
  return protocolDeskRequestDetailSchema.parse(await response.json());
}
