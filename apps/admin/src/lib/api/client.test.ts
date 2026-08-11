import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthState, getAuthState, setAuthState } from "./auth-store";
import {
  ApiClientError,
  createContentDraft,
  exportContentAudit,
  getContentAuditIntegrity,
  listContentAudit,
  listContentVersions,
  listSessions,
  login,
  logout,
  publishContentVersion,
  rollbackContentVersion,
  unpublishContent,
  revokeSession,
  signMediaUpload,
  listMediaAssets,
  getMediaInventory,
  getSourceAuditReport,
  updateMediaAsset,
  transitionContentVersion,
  listProtocolDeskQueue,
  getProtocolDeskRequest,
  assignProtocolDeskRequest,
  addProtocolDeskNote,
  transitionProtocolDeskRequest,
  clearProtocolDeskFlag,
  retryProtocolDeskCalendarSync,
  retryPrincipalDecisionDelivery,
  changeAdministratorRoles,
  listAdministrators,
  setAdministratorDisabled,
  stepUp,
} from "./client";

const response = (status: number, body?: unknown) =>
  new Response(
    body === undefined ? null : JSON.stringify(body),
    body === undefined
      ? { status }
      : { status, headers: { "Content-Type": "application/json" } },
  );

describe("admin API client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test/v1";
    clearAuthState();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps access and CSRF tokens in memory and relies on API-origin cookies", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        accessToken: "access-token",
        csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
        expiresIn: 300,
        user: { id: "user-1", roles: ["editor"] },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await login({
      email: "editor@example.test",
      password: "a-long-development-passphrase",
      mfaCode: "123456",
    });
    expect(getAuthState()).toEqual(
      expect.objectContaining({ accessToken: "access-token" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/v1/auth/login",
      expect.objectContaining({ credentials: "include" }),
    );
    const [, loginInit] = fetchMock.mock.calls[0] as [
      string,
      { headers: Headers },
    ];
    expect(loginInit.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/u);
    expect(loginInit.headers.get("traceparent")).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/u,
    );
    expect(document.cookie).not.toContain("access-token");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("replaces only the in-memory access token after recent MFA step-up", async () => {
    setAuthState({
      accessToken: "ordinary-access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          accessToken: "elevated-access",
          expiresIn: 300,
          user: { id: "user-1", roles: ["security_admin"] },
        }),
      ),
    );
    await stepUp("123456");
    expect(getAuthState()).toEqual({
      accessToken: "elevated-access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
  });

  it("coalesces refresh after a 401, retries once, and parses typed sessions", async () => {
    setAuthState({
      accessToken: "expired",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(401, {
          statusCode: 401,
          code: "UNAUTHORIZED",
          message: "Expired",
          requestId: "r1",
          timestamp: new Date().toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          accessToken: "renewed",
          expiresIn: 300,
          user: { id: "user-1", roles: ["editor"] },
        }),
      )
      .mockResolvedValueOnce(
        response(200, [
          {
            sessionId: "s1",
            familyId: "f1",
            authenticationMethods: ["pwd", "totp"],
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 1000).toISOString(),
            current: true,
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({ sessionId: "s1", current: true }),
    ]);
    expect(getAuthState()?.accessToken).toBe("renewed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("clears memory on logout even when the API rejects the request", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(500, {
          statusCode: 500,
          code: "ERROR",
          message: "Failed",
          requestId: "r2",
          timestamp: new Date().toISOString(),
        }),
      ),
    );
    await expect(logout()).rejects.toBeInstanceOf(ApiClientError);
    expect(getAuthState()).toBeNull();
  });

  it("revokes an encoded owned session with bearer and CSRF protection", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const fetchMock = vi.fn().mockResolvedValue(response(204));
    vi.stubGlobal("fetch", fetchMock);

    await expect(revokeSession("session/other")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/v1/auth/sessions/session%2Fother",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
    expect(init.headers.get("Authorization")).toBe("Bearer access");
    expect(init.headers.get("X-CSRF-Token")).toBe(
      "csrf-token-that-is-at-least-thirty-two-bytes",
    );
  });

  it("uses typed account inventory, role and disablement boundaries", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const administrator = {
      userId: "editor/2",
      emailCanonical: "editor-2@example.test",
      roles: ["editor"],
      roleVersion: 1,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, [administrator]))
      .mockResolvedValueOnce(
        response(200, {
          ...administrator,
          roles: ["reviewer"],
          roleVersion: 2,
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          ...administrator,
          roleVersion: 3,
          disabledAt: "2026-08-10T00:00:00.000Z",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAdministrators()).resolves.toEqual([
      expect.objectContaining({ userId: "editor/2" }),
    ]);
    await expect(
      changeAdministratorRoles("editor/2", ["reviewer"]),
    ).resolves.toMatchObject({ roles: ["reviewer"], roleVersion: 2 });
    await expect(
      setAdministratorDisabled("editor/2", true),
    ).resolves.toMatchObject({
      roleVersion: 3,
      disabledAt: expect.any(Date),
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/v1/auth/users",
      "https://api.example.test/v1/auth/users/editor%2F2/roles",
      "https://api.example.test/v1/auth/users/editor%2F2/status",
    ]);
    for (const [, init] of fetchMock.mock.calls.slice(1) as Array<
      [string, { headers: Headers }]
    >) {
      expect(init.headers.get("X-CSRF-Token")).toBe(
        "csrf-token-that-is-at-least-thirty-two-bytes",
      );
    }
  });

  it("requests Cloudinary signatures through NestJS without receiving an API secret", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const signed = {
      cloudName: "amanor",
      apiKey: "123",
      timestamp: 1786302000,
      folder: "amanor/portraits",
      resourceType: "image",
      signature: "signature",
      uploadUrl: "https://api.cloudinary.com/v1_1/amanor/image/upload",
      overwrite: false,
      uniqueFilename: true,
    };
    const fetchMock = vi.fn().mockResolvedValue(response(200, signed));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      signMediaUpload({ folder: "portraits", resourceType: "image" }),
    ).resolves.toEqual(signed);
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Headers }];
    expect(init.headers.get("Authorization")).toBe("Bearer access");
    expect(init.headers.get("X-CSRF-Token")).toBe(
      "csrf-token-that-is-at-least-thirty-two-bytes",
    );
    expect(JSON.stringify(signed)).not.toMatch(/apiSecret/i);
  });

  it("lists media and updates governance metadata through typed NestJS routes", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const asset = {
      publicId: "amanor/portraits/portrait-1",
      resourceType: "image",
      altText: {
        "en-GB": "Portrait",
        "fr-FR": "Portrait FR",
        status: {
          "en-GB": "current" as const,
          "fr-FR": "current" as const,
        },
        sourceUpdatedAt: "2026-08-10T00:00:00.000Z",
      },
      credit: "Photographer",
      sourceRef: "S01",
      licence: "Editorial use",
      transformationPolicy: "portrait",
      retentionPolicy: "standard",
      legalHold: false,
      focalPoint: { x: 0.3, y: 0.7 },
      assetId: "00000000-0000-4000-8000-000000000001",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/portrait.jpg",
      format: "jpg",
      bytes: 1000,
      width: 1200,
      height: 800,
      version: 1,
      status: "active",
      createdBy: "editor-1",
      createdAt: "2026-08-10T00:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, { items: [asset] }))
      .mockResolvedValueOnce(response(200, asset));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listMediaAssets({ folder: "portraits", assetId: asset.assetId }),
    ).resolves.toMatchObject({ items: [{ assetId: asset.assetId }] });
    await expect(
      updateMediaAsset(asset.assetId, {
        altText: {
          ...asset.altText,
          sourceUpdatedAt: new Date(asset.altText.sourceUpdatedAt),
        },
        credit: asset.credit,
        sourceRef: asset.sourceRef,
        licence: asset.licence,
        transformationPolicy: "portrait",
        retentionPolicy: "standard",
        legalHold: false,
        focalPoint: asset.focalPoint,
      }),
    ).resolves.toMatchObject({ focalPoint: asset.focalPoint });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `https://api.example.test/v1/media/assets?limit=25&assetId=${asset.assetId}&folder=portraits`,
      `https://api.example.test/v1/media/assets/${asset.assetId}`,
    ]);
    const [, updateInit] = fetchMock.mock.calls[1] as [
      string,
      { method: string; headers: Headers },
    ];
    expect(updateInit.method).toBe("PATCH");
    expect(updateInit.headers.get("X-CSRF-Token")).toBe(
      "csrf-token-that-is-at-least-thirty-two-bytes",
    );
  });

  it("retrieves the protected complete media inventory", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const report = {
      generatedAt: "2026-08-10T00:00:00.000Z",
      totals: {
        assets: 0,
        active: 0,
        deleted: 0,
        quarantined: 0,
        published: 0,
        actionRequired: 0,
      },
      items: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(response(200, report));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getMediaInventory()).resolves.toMatchObject({
      totals: { assets: 0, actionRequired: 0 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/v1/media/assets/inventory",
    );
  });

  it("retrieves the complete protected source audit", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        generatedAt: "2026-08-10T00:00:00.000Z",
        totals: {
          publications: 0,
          sourceEntries: 0,
          claimReferences: 0,
          missingReferences: 0,
          unusedSources: 0,
          duplicateReferences: 0,
        },
        sources: [],
        claims: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getSourceAuditReport()).resolves.toMatchObject({
      totals: { sourceEntries: 0, missingReferences: 0 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/v1/cms/content/source-audit/report",
    );
  });

  it("uses typed CMS version, workflow, publication and audit endpoints", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const version = {
      documentType: "page",
      documentId: "home",
      version: 1,
      state: "draft",
      authorId: "editor-1",
      payload: { slug: "/" },
    };
    const publication = {
      documentType: "page",
      documentId: "home",
      version: 1,
      locale: "en-GB",
      publishedAt: "2026-08-09T20:00:00.000Z",
    };
    const audit = [
      {
        eventId: "event-1",
        documentType: "page",
        documentId: "home",
        version: 1,
        actorId: "editor-1",
        action: "created",
        sequence: 1,
        occurredAt: "2026-08-09T19:00:00.000Z",
        metadata: { state: "draft" },
        changes: [],
        eventHash: "abc123",
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, [version]))
      .mockResolvedValueOnce(response(201, version))
      .mockResolvedValueOnce(response(200, { ...version, state: "in_review" }))
      .mockResolvedValueOnce(response(200, publication))
      .mockResolvedValueOnce(response(200, audit));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listContentVersions("page", "home")).resolves.toHaveLength(1);
    await expect(
      createContentDraft("page", "home", { slug: "/" }),
    ).resolves.toEqual(expect.objectContaining({ version: 1 }));
    await expect(
      transitionContentVersion({
        documentType: "page",
        documentId: "home",
        version: 1,
        action: "submit",
      }),
    ).resolves.toEqual(expect.objectContaining({ state: "in_review" }));
    await expect(
      publishContentVersion({
        documentType: "page",
        documentId: "home",
        version: 1,
        locale: "en-GB",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ publishedAt: expect.any(Date) }),
    );
    await expect(listContentAudit("page", "home", 25)).resolves.toEqual([
      expect.objectContaining({ occurredAt: expect.any(Date) }),
    ]);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/v1/cms/content/page/home/versions",
      "https://api.example.test/v1/cms/content/page/home/versions",
      "https://api.example.test/v1/cms/content/page/home/versions/1/actions",
      "https://api.example.test/v1/cms/content/page/home/versions/1/publish",
      "https://api.example.test/v1/cms/content/page/home/audit?limit=25",
    ]);
    for (const [, init] of fetchMock.mock.calls.slice(1, 4) as Array<
      [string, { headers: Headers }]
    >) {
      expect(init.headers.get("Authorization")).toBe("Bearer access");
      expect(init.headers.get("X-CSRF-Token")).toBe(
        "csrf-token-that-is-at-least-thirty-two-bytes",
      );
    }
  });

  it("uses authenticated rollback and portable audit-export endpoints", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const publication = {
      documentType: "page",
      documentId: "home",
      version: 1,
      locale: "fr-FR",
      publishedAt: "2026-08-09T20:00:00.000Z",
    };
    const exported = {
      format: "amanor-editorial-audit-v2",
      generatedAt: "2026-08-09T20:01:00.000Z",
      documentType: "page",
      documentId: "home",
      events: [],
      integrity: { status: "valid", checkedEvents: 0 },
    };
    const unpublication = {
      documentType: "page",
      documentId: "home",
      version: 1,
      locale: "fr-FR",
      unpublishedAt: "2026-08-09T20:02:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, publication))
      .mockResolvedValueOnce(response(200, exported))
      .mockResolvedValueOnce(response(200, unpublication))
      .mockResolvedValueOnce(
        response(200, { status: "valid", checkedEvents: 4, headSequence: 4 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      rollbackContentVersion({
        documentType: "page",
        documentId: "home",
        version: 1,
        locale: "fr-FR",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ publishedAt: expect.any(Date) }),
    );
    await expect(exportContentAudit("page", "home")).resolves.toEqual(
      expect.objectContaining({ generatedAt: expect.any(Date) }),
    );
    await expect(
      unpublishContent({
        documentType: "page",
        documentId: "home",
        locale: "fr-FR",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ unpublishedAt: expect.any(Date) }),
    );
    await expect(getContentAuditIntegrity("page", "home")).resolves.toEqual({
      status: "valid",
      checkedEvents: 4,
      headSequence: 4,
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/v1/cms/content/page/home/versions/1/rollback",
      "https://api.example.test/v1/cms/content/page/home/audit/export?limit=250",
      "https://api.example.test/v1/cms/content/page/home/unpublish",
      "https://api.example.test/v1/cms/content/page/home/audit/integrity",
    ]);
    const rollbackRequest = fetchMock.mock.calls[0]?.[1] as {
      headers: Headers;
    };
    expect(rollbackRequest.headers.get("X-CSRF-Token")).toBe(
      "csrf-token-that-is-at-least-thirty-two-bytes",
    );
  });

  it("uses typed protected Protocol Desk queue, detail and mutation endpoints", async () => {
    setAuthState({
      accessToken: "access",
      csrfToken: "csrf-token-that-is-at-least-thirty-two-bytes",
    });
    const queueItem = {
      requestId: "11111111-1111-4111-8111-111111111111",
      reference: "PD-2026-0042",
      state: "screened",
      capacity: "personal",
      organisationName: "African Forum",
      organisationType: "multilateral",
      eventName: "Finance Forum",
      engagementType: "keynote",
      startsAt: "2026-12-01T09:00:00Z",
      country: "SL",
      locale: "en-GB",
      triageScore: 88,
      flags: [],
      createdAt: "2026-08-10T00:00:00Z",
      updatedAt: "2026-08-10T00:00:01Z",
    };
    const detail = {
      request: {
        ...queueItem,
        requester: {
          name: "Ama Mensah",
          role: "Director",
          email: "ama@example.test",
        },
        objective: "Mobilise investment",
        audienceDescription: "Ministers and investors",
        contactName: "Kojo",
        contactPhone: "+233200000000",
        triageDimensions: [],
      },
      nextStates: ["awaiting_decision"],
      events: [],
      notes: [],
      correspondence: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, { items: [queueItem] }))
      .mockImplementation(() => Promise.resolve(response(200, detail)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      listProtocolDeskQueue({
        state: "screened",
        flag: "conflict",
        q: "Forum",
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ startsAt: expect.any(Date) })],
    });
    await getProtocolDeskRequest(queueItem.requestId);
    await assignProtocolDeskRequest(queueItem.requestId, "desk-2");
    await addProtocolDeskNote(queueItem.requestId, "Review complete");
    await transitionProtocolDeskRequest(
      queueItem.requestId,
      "awaiting_decision",
      "Ready",
    );
    await clearProtocolDeskFlag(
      queueItem.requestId,
      "22222222-2222-4222-8222-222222222222",
      "False positive",
    );
    await retryProtocolDeskCalendarSync(
      queueItem.requestId,
      "33333333-3333-4333-8333-333333333333",
    );
    await retryPrincipalDecisionDelivery(
      queueItem.requestId,
      "44444444-4444-4444-8444-444444444444",
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/v1/desk/requests?limit=25&q=Forum&state=screened&flag=conflict",
      `https://api.example.test/v1/desk/requests/${queueItem.requestId}`,
      `https://api.example.test/v1/desk/requests/${queueItem.requestId}/assignment`,
      `https://api.example.test/v1/desk/requests/${queueItem.requestId}/notes`,
      `https://api.example.test/v1/desk/requests/${queueItem.requestId}/transitions`,
      `https://api.example.test/v1/desk/requests/${queueItem.requestId}/flags/22222222-2222-4222-8222-222222222222/clearance`,
      `https://api.example.test/v1/desk/requests/${queueItem.requestId}/calendar-sync/33333333-3333-4333-8333-333333333333/retry`,
      `https://api.example.test/v1/desk/requests/${queueItem.requestId}/principal-decision-delivery/44444444-4444-4444-8444-444444444444/retry`,
    ]);
  });
});
