import { describe, expect, it, vi } from "vitest";
import type { ContentVersion } from "../domain/workflow";
import type { CmsRepository } from "../persistence/cms.repository";
import type { EditorialRole } from "../domain/types";
import { CmsService } from "./cms.service";
import type { MediaReferenceService } from "../../media/application/media-reference.service";

const sourcePayload = {
  ref: "source-1",
  title: "Official record",
  publisher: "Institution",
  accessedAt: "2026-08-09T00:00:00.000Z",
  type: "official",
};

const localized = (english: string, french: string) => ({
  "en-GB": english,
  "fr-FR": french,
  status: { "en-GB": "current" as const, "fr-FR": "current" as const },
  sourceUpdatedAt: new Date("2026-08-09T00:00:00.000Z"),
});

const pagePayload = {
  slug: "/privacy",
  title: localized("Privacy", "Confidentialité"),
  summary: localized("Privacy summary", "Résumé de confidentialité"),
  sections: [
    { key: "opening", body: localized("English body", "Corps français") },
  ],
  seoTitle: localized("Privacy", "Confidentialité"),
  seoDescription: localized("Privacy details", "Détails de confidentialité"),
};

const allRoles: readonly EditorialRole[] = [
  "principal",
  "desk_officer",
  "editor",
  "translator",
  "reviewer",
  "press_officer",
  "trust_admin",
  "security_admin",
];

function fixture(
  version?: ContentVersion,
  mediaReferences?: Pick<MediaReferenceService, "assertPublishable">,
) {
  const repository = {
    createDraft: vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ ...input, version: 1, state: "draft" }),
      ),
    appendAudit: vi.fn().mockResolvedValue(undefined),
    currentAuditHash: vi.fn().mockResolvedValue(undefined),
    findVersion: vi.fn().mockResolvedValue(version ?? null),
    findLatestVersion: vi.fn().mockResolvedValue(version ?? null),
    findPublication: vi.fn().mockResolvedValue(null),
    listVersions: vi.fn().mockResolvedValue(version ? [version] : []),
    listDocuments: vi.fn().mockResolvedValue({ items: [] }),
    listPublicSources: vi.fn().mockResolvedValue({ items: [] }),
    latestPublicSignal: vi.fn().mockResolvedValue(null),
    listPublicSignals: vi.fn().mockResolvedValue([]),
    listPublicScholars: vi.fn().mockResolvedValue([]),
    findMissingPublishedSourceRefs: vi.fn().mockResolvedValue([]),
    findPublishedSourceDependents: vi.fn().mockResolvedValue([]),
    listPublishedForSourceAudit: vi.fn().mockResolvedValue([]),
    findPublished: vi.fn().mockResolvedValue(null),
    replaceVersion: vi.fn().mockResolvedValue(true),
    publishTransaction: vi.fn().mockResolvedValue(undefined),
    unpublishTransaction: vi.fn().mockResolvedValue({
      documentType: "source",
      documentId: "source-1",
      locale: "en-GB",
      version: 1,
      unpublishedAt: new Date("2026-08-10T00:00:00Z"),
    }),
    listAudit: vi.fn().mockResolvedValue([]),
    verifyAuditIntegrity: vi.fn().mockResolvedValue({
      status: "valid",
      checkedEvents: 0,
    }),
  };
  return {
    service: new CmsService(
      repository as unknown as CmsRepository,
      mediaReferences as MediaReferenceService | undefined,
    ),
    repository,
  };
}

describe("CmsService", () => {
  it("uses bounded cursor pagination for document discovery", async () => {
    const { service, repository } = fixture();
    await expect(service.listDocuments("page", 250, "home")).resolves.toEqual({
      items: [],
    });
    expect(repository.listDocuments).toHaveBeenCalledWith("page", 100, "home");
  });

  it("uses bounded public Source Register pagination", async () => {
    const { service, repository } = fixture();
    await expect(
      service.listPublicSources("en-GB", 200, "source-1", "official"),
    ).resolves.toEqual({ items: [] });
    expect(repository.listPublicSources).toHaveBeenCalledWith(
      "en-GB",
      50,
      "source-1",
      "official",
    );
  });

  it("projects only the latest exact published Signal locale", async () => {
    const { service, repository } = fixture();
    repository.latestPublicSignal.mockResolvedValue({
      documentId: "signal-1",
      publishedAt: new Date("2026-08-10T00:00:00Z"),
      payload: {
        slug: "signal-1",
        body: {
          "en-GB": "English signal",
          "fr-FR": "Signal français",
          status: { "en-GB": "current", "fr-FR": "current" },
          sourceUpdatedAt: new Date("2026-08-10T00:00:00Z"),
        },
        sourceRefs: ["source-1"],
      },
    });
    await expect(service.latestPublicSignal("fr-FR")).resolves.toMatchObject({
      documentId: "signal-1",
      payload: { body: "Signal français", sourceRefs: ["source-1"] },
      translation: { stale: false },
    });
  });

  it("projects every published Signal and aggregate translation state", async () => {
    const { service, repository } = fixture();
    repository.listPublicSignals.mockResolvedValue([
      {
        documentId: "signal-1",
        publishedAt: new Date("2026-08-10T00:00:00Z"),
        payload: {
          slug: "signal-1",
          body: {
            "en-GB": "English signal",
            "fr-FR": "Signal français",
            status: { "en-GB": "current", "fr-FR": "stale" },
            sourceUpdatedAt: new Date("2026-08-10T00:00:00Z"),
          },
          tags: ["economy"],
          confidence: "watching",
          changeMyMind: {
            "en-GB": "Evidence",
            "fr-FR": "Preuve",
            status: { "en-GB": "current", "fr-FR": "current" },
          },
          sourceRefs: ["source-1"],
        },
      },
    ]);
    await expect(service.listPublicSignals("fr-FR")).resolves.toMatchObject({
      items: [
        {
          documentId: "signal-1",
          body: "Signal français",
          changeMyMind: "Preuve",
        },
      ],
      translation: {
        stale: true,
        sourceUpdatedAt: new Date("2026-08-10T00:00:00Z"),
      },
    });
  });

  it("projects consent-filtered scholars without exposing consent records", async () => {
    const { service, repository } = fixture();
    repository.listPublicScholars.mockResolvedValue([
      {
        documentId: "scholar-1",
        publishedAt: new Date("2026-08-10T00:00:00Z"),
        payload: {
          name: "Ama",
          country: "GH",
          institution: "University",
          field: {
            "en-GB": "Economics",
            "fr-FR": "Économie",
            status: { "en-GB": "current", "fr-FR": "current" },
          },
          cohortYear: 2024,
          status: "Active",
          story: {
            "en-GB": "Story",
            "fr-FR": "Parcours",
            status: { "en-GB": "current", "fr-FR": "current" },
          },
          consentStatus: "granted",
          consentDate: new Date("2026-01-01"),
          consentVersion: "v1",
          profileImageUrl: "https://untrusted.example/profile.jpg",
        },
      },
    ]);
    const result = await service.listPublicScholars("fr-FR");
    expect(result).toMatchObject({
      scholars: [
        { documentId: "scholar-1", field: "Économie", story: "Parcours" },
      ],
      translation: { stale: false },
    });
    expect(result.scholars[0]).not.toHaveProperty("consentStatus");
    expect(result.scholars[0]).not.toHaveProperty("consentDate");
    expect(result.scholars[0]).not.toHaveProperty("consentVersion");
    expect(result.scholars[0]).not.toHaveProperty("profileImageUrl");
  });

  it("audits every published claim against same-locale Source Register entries", async () => {
    const { service, repository } = fixture();
    repository.listPublishedForSourceAudit.mockResolvedValue([
      {
        documentType: "source",
        documentId: "source-1",
        locale: "en-GB",
        version: 1,
        payload: sourcePayload,
      },
      {
        documentType: "page",
        documentId: "record",
        locale: "en-GB",
        version: 2,
        payload: { sourceRefs: ["source-1", "missing-source"] },
      },
    ]);
    const report = await service.sourceAudit({
      id: "reviewer-1",
      roles: ["reviewer"],
    });
    expect(report.totals).toMatchObject({
      publications: 2,
      sourceEntries: 1,
      claimReferences: 2,
      missingReferences: 1,
    });
    expect(report.claims[0]).toMatchObject({
      documentId: "record",
      missingSourceRefs: ["missing-source"],
    });
    expect(report.sources[0]).toMatchObject({
      ref: "source-1",
      dependentPublications: 1,
      status: "used",
    });
    await expect(
      service.sourceAudit({ id: "desk-1", roles: ["desk_officer"] }),
    ).rejects.toThrow(/content:review permission/i);
  });

  it("validates supported content and records creation in the audit chain", async () => {
    const { service, repository } = fixture();
    await expect(
      service.createDraft("source", "source-1", sourcePayload, {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).resolves.toEqual(expect.objectContaining({ state: "draft", version: 1 }));
    expect(repository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "editor-1" }),
    );
    await expect(
      service.createDraft(
        "source",
        "source-2",
        {},
        { id: "editor-1", roles: ["editor"] },
      ),
    ).rejects.toThrow();
    await expect(
      service.createDraft("source", "source-2", sourcePayload, {
        id: "security-1",
        roles: ["security_admin"],
      }),
    ).rejects.toThrow(/write or translation permission/i);
  });

  it("enforces the complete general-content draft role matrix", async () => {
    for (const role of allRoles) {
      const { service, repository } = fixture();
      const operation = service.createDraft(
        "source",
        `source-${role}`,
        sourcePayload,
        { id: role, roles: [role] },
      );
      if (role === "principal" || role === "editor") {
        await expect(operation).resolves.toMatchObject({ state: "draft" });
        expect(repository.createDraft).toHaveBeenCalledOnce();
      } else if (role === "translator") {
        await expect(operation).rejects.toThrow(/cannot create a new/i);
        expect(repository.createDraft).not.toHaveBeenCalled();
      } else {
        await expect(operation).rejects.toThrow(/permission/i);
        expect(repository.createDraft).not.toHaveBeenCalled();
      }
    }
  });

  it("allows translators to change only French-localized fields on an existing document", async () => {
    const previous: ContentVersion = {
      documentType: "page",
      documentId: "privacy",
      version: 2,
      state: "published",
      authorId: "editor-1",
      payload: pagePayload,
    };
    const { service, repository } = fixture(previous);
    const translated = {
      ...pagePayload,
      title: { ...pagePayload.title, "fr-FR": "Vie privée" },
      sections: [
        {
          ...pagePayload.sections[0],
          body: {
            ...pagePayload.sections[0]!.body,
            "fr-FR": "Nouveau corps français",
          },
        },
      ],
    };
    await expect(
      service.createDraft("page", "privacy", translated, {
        id: "translator-1",
        roles: ["translator"],
      }),
    ).resolves.toMatchObject({ state: "draft" });
    expect(repository.createDraft).toHaveBeenCalledOnce();

    await expect(
      service.createDraft(
        "page",
        "privacy",
        { ...translated, slug: "/changed-authoritative-path" },
        { id: "translator-1", roles: ["translator"] },
      ),
    ).rejects.toThrow(/only French-localized fields/i);
    await expect(
      service.createDraft(
        "page",
        "privacy",
        {
          ...translated,
          title: { ...translated.title, "en-GB": "Changed English" },
        },
        { id: "translator-1", roles: ["translator"] },
      ),
    ).rejects.toThrow(/only French-localized fields/i);
  });

  it("scopes identity, Desk and scholar drafts to their domain permissions", async () => {
    const blackout = {
      startsAt: new Date("2026-08-10T08:00:00Z"),
      endsAt: new Date("2026-08-10T12:00:00Z"),
      reason: "public_duty" as const,
      visibility: "busy" as const,
    };
    const scholar = {
      name: "Scholar",
      country: "GH",
      institution: "University",
      field: localized("Economics", "Économie"),
      cohortYear: 2026,
      status: "active",
      story: localized("Story", "Histoire"),
      consentStatus: "pending" as const,
    };
    await expect(
      fixture().service.createDraft("blackout", "blackout-1", blackout, {
        id: "desk-1",
        roles: ["desk_officer"],
      }),
    ).resolves.toMatchObject({ state: "draft" });
    await expect(
      fixture().service.createDraft("scholar", "scholar-1", scholar, {
        id: "trust-1",
        roles: ["trust_admin"],
      }),
    ).resolves.toMatchObject({ state: "draft" });
    await expect(
      fixture().service.createDraft("blackout", "blackout-2", blackout, {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/desk:operate permission/i);
    await expect(
      fixture().service.createDraft("scholar", "scholar-2", scholar, {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/legacy:manage permission/i);
    await expect(
      fixture().service.createDraft(
        "identity",
        "canonical",
        {},
        {
          id: "editor-1",
          roles: ["editor"],
        },
      ),
    ).rejects.toThrow(/identity:manage permission/i);
  });

  it("enforces author, reviewer and publisher permissions for every workflow action", async () => {
    const cases = [
      { action: "submit" as const, state: "draft" as const },
      { action: "request_changes" as const, state: "in_review" as const },
      { action: "approve" as const, state: "in_review" as const },
      { action: "schedule" as const, state: "approved" as const },
      { action: "publish" as const, state: "approved" as const },
      { action: "supersede" as const, state: "published" as const },
    ];
    for (const testCase of cases) {
      for (const role of allRoles) {
        const version: ContentVersion = {
          documentType: "source",
          documentId: "source-1",
          version: 1,
          state: testCase.state,
          authorId: role,
          payload: sourcePayload,
        };
        const { service } = fixture(version);
        const operation = service.transition(
          "source",
          "source-1",
          1,
          testCase.action,
          { id: role, roles: [role] },
          testCase.action === "schedule"
            ? { scheduledFor: new Date("2026-08-11T00:00:00Z") }
            : {},
        );
        const allowed =
          testCase.action === "submit"
            ? ["principal", "editor", "translator"].includes(role)
            : ["principal", "reviewer"].includes(role);
        if (allowed) await expect(operation).resolves.toBeDefined();
        else await expect(operation).rejects.toThrow(/permission/i);
      }
    }
  });

  it("enforces the two-person approval rule through the workflow transition", async () => {
    const version: ContentVersion = {
      documentType: "source",
      documentId: "source-1",
      version: 1,
      state: "in_review",
      authorId: "editor-1",
      payload: sourcePayload,
    };
    const { service } = fixture(version);
    await expect(
      service.transition(
        "source",
        "source-1",
        1,
        "approve",
        { id: "editor-1", roles: ["reviewer"] },
        { policySensitive: true },
      ),
    ).rejects.toThrow(/different approver/i);
    await expect(
      service.transition(
        "source",
        "source-1",
        1,
        "approve",
        { id: "reviewer-2", roles: ["reviewer"] },
        { policySensitive: true },
      ),
    ).resolves.toEqual(
      expect.objectContaining({ state: "approved", reviewerId: "reviewer-2" }),
    );
  });

  it("publishes only approved content in a transaction and queues narrow tags", async () => {
    const version: ContentVersion = {
      documentType: "source",
      documentId: "source-1",
      version: 1,
      state: "approved",
      authorId: "editor-1",
      reviewerId: "reviewer-2",
      payload: sourcePayload,
    };
    const { service, repository } = fixture(version);
    await expect(
      service.publish("source", "source-1", 1, "en-GB", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).resolves.toEqual(
      expect.objectContaining({ locale: "en-GB", version: 1 }),
    );
    expect(repository.publishTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.arrayContaining([
          "content:source:source-1",
          "locale:en-GB",
        ]),
      }),
    );
  });

  it("fails closed before publication when governed media is unavailable", async () => {
    const assetId = "00000000-0000-4000-8000-000000000001";
    const version: ContentVersion = {
      documentType: "page",
      documentId: "privacy",
      version: 1,
      state: "approved",
      authorId: "editor-1",
      reviewerId: "reviewer-2",
      payload: { ...pagePayload, ogImage: assetId },
    };
    const mediaReferences = {
      assertPublishable: vi
        .fn()
        .mockRejectedValue(new Error("ogImage: governed media is not active")),
    };
    const { service, repository } = fixture(version, mediaReferences);

    await expect(
      service.publish("page", "privacy", 1, "en-GB", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).rejects.toThrow(/publication validation failed.*ogImage.*not active/iu);
    expect(mediaReferences.assertPublishable).toHaveBeenCalledWith([
      { assetId, resourceType: "image", path: "ogImage" },
    ]);
    expect(repository.publishTransaction).not.toHaveBeenCalled();
  });

  it("can publish one approved version to the second locale without republishing the first", async () => {
    const version: ContentVersion = {
      documentType: "source",
      documentId: "source-1",
      version: 1,
      state: "published",
      authorId: "editor-1",
      reviewerId: "reviewer-2",
      payload: sourcePayload,
    };
    const { service, repository } = fixture(version);
    repository.findPublication.mockResolvedValue(null);
    await expect(
      service.publish("source", "source-1", 1, "fr-FR", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).resolves.toEqual(expect.objectContaining({ locale: "fr-FR" }));
    repository.findPublication.mockResolvedValue({
      documentType: "source",
      documentId: "source-1",
      locale: "fr-FR",
      version: 1,
      publishedAt: new Date(),
    });
    await expect(
      service.publish("source", "source-1", 1, "fr-FR", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).rejects.toThrow(/already published/i);
  });

  it("fails closed when a named source is not published in the target locale", async () => {
    const version: ContentVersion = {
      documentType: "archiveItem",
      documentId: "speech-1",
      version: 1,
      state: "approved",
      authorId: "editor-1",
      reviewerId: "reviewer-2",
      payload: {
        slug: "speech-1",
        title: {
          "en-GB": "Speech",
          "fr-FR": "Discours",
          status: { "en-GB": "current", "fr-FR": "current" },
          sourceUpdatedAt: new Date(),
        },
        type: "speech",
        date: new Date(),
        language: "en",
        transcript: {
          "en-GB": "Speech transcript",
          "fr-FR": "Transcription du discours",
          status: { "en-GB": "current", "fr-FR": "current" },
          sourceUpdatedAt: new Date(),
        },
        transcriptStatus: "corrected",
        sourceRefs: ["missing-source"],
        approvedForDoctrine: false,
      },
    };
    const { service, repository } = fixture(version);
    repository.findMissingPublishedSourceRefs.mockResolvedValue([
      "missing-source",
    ]);
    await expect(
      service.publish("archiveItem", "speech-1", 1, "en-GB", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).rejects.toThrow(/not published.*missing-source/i);
    expect(repository.publishTransaction).not.toHaveBeenCalled();
  });

  it("restores only a previously published version and records the version change", async () => {
    const version: ContentVersion = {
      documentType: "source",
      documentId: "source-1",
      version: 1,
      state: "superseded",
      authorId: "editor-1",
      payload: sourcePayload,
    };
    const { service, repository } = fixture(version);
    repository.findPublication.mockResolvedValue({
      documentType: "source",
      documentId: "source-1",
      locale: "en-GB",
      version: 2,
      publishedAt: new Date(),
    });
    await expect(
      service.rollback("source", "source-1", 1, "en-GB", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).resolves.toEqual(expect.objectContaining({ version: 1 }));
    expect(repository.publishTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          action: "rolled_back",
          metadata: { locale: "en-GB", fromVersion: 2, toVersion: 1 },
        }),
      }),
    );
    await expect(
      service.rollback("source", "source-1", 1, "en-GB", {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/content:publish permission/i);
  });

  it("exports a bounded portable audit envelope", async () => {
    const { service, repository } = fixture();
    repository.listAudit.mockResolvedValue([{ eventId: "event-1" }]);
    const generatedAt = new Date("2026-08-09T20:00:00Z");
    await expect(
      service.exportAudit("source", "source-1", 250, generatedAt),
    ).resolves.toEqual({
      format: "amanor-editorial-audit-v2",
      generatedAt,
      documentType: "source",
      documentId: "source-1",
      events: [{ eventId: "event-1" }],
      integrity: { status: "valid", checkedEvents: 0 },
    });
  });

  it("restricts unpublish and delegates the atomic takedown", async () => {
    const { service, repository } = fixture();
    await expect(
      service.unpublish("source", "source-1", "en-GB", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).resolves.toEqual(expect.objectContaining({ locale: "en-GB" }));
    expect(repository.unpublishTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: "source",
        documentId: "source-1",
        actorId: "reviewer-2",
      }),
    );
    await expect(
      service.unpublish("source", "source-1", "en-GB", {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/content:publish permission/i);
  });

  it("does not let a source takedown silently break published claims", async () => {
    const { service, repository } = fixture();
    repository.findPublished.mockResolvedValue({
      publication: {
        documentType: "source",
        documentId: "source-1",
        locale: "en-GB",
        version: 1,
        publishedAt: new Date(),
      },
      payload: sourcePayload,
    });
    repository.findPublishedSourceDependents.mockResolvedValue([
      "archiveItem:speech-1",
    ]);
    await expect(
      service.unpublish("source", "source-1", "en-GB", {
        id: "reviewer-2",
        roles: ["reviewer"],
      }),
    ).rejects.toThrow(/referenced.*archiveItem:speech-1/i);
    expect(repository.unpublishTransaction).not.toHaveBeenCalled();
  });
});
