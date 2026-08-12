import { describe, expect, it, vi } from "vitest";
import type { CloudinaryService } from "../infrastructure/cloudinary.service";
import type { MediaRepository } from "../persistence/media.repository";
import { MediaService } from "./media.service";

const localized = {
  "en-GB": "Portrait",
  "fr-FR": "Portrait FR",
  status: { "en-GB": "current" as const, "fr-FR": "current" as const },
  sourceUpdatedAt: new Date(),
};
const input = {
  publicId: "amanor/portraits/portrait-1",
  resourceType: "image" as const,
  altText: localized,
  credit: "Photographer",
  sourceRef: "source-1",
  consentReference: "consent-1",
  licence: "licensed",
  transformationPolicy: "portrait" as const,
  retentionPolicy: "standard" as const,
  legalHold: false,
};

function fixture(bytes = 1_000, format = "jpg") {
  const cloudinary = {
    signUpload: vi.fn().mockReturnValue({ signature: "signed" }),
    verifyAsset: vi.fn().mockResolvedValue({
      publicId: input.publicId,
      resourceType: "image",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/portrait.jpg",
      format,
      bytes,
      width: 1200,
      height: 800,
      version: 1,
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  const repository = {
    create: vi.fn().mockResolvedValue(undefined),
    existsByPublicId: vi.fn().mockResolvedValue(false),
    find: vi.fn(),
    findPublic: vi.fn(),
    list: vi.fn(),
    inventory: vi.fn(),
    updateMetadata: vi.fn(),
    isReferencedByPublication: vi.fn().mockResolvedValue(false),
    claimManualDeletion: vi.fn(),
    restoreManualDeletion: vi.fn().mockResolvedValue(undefined),
    completeRetention: vi.fn().mockResolvedValue(true),
  };
  return {
    service: new MediaService(
      cloudinary as unknown as CloudinaryService,
      repository as unknown as MediaRepository,
    ),
    cloudinary,
    repository,
  };
}

describe("MediaService", () => {
  it("requires a governance role and independently verifies uploads before registration", async () => {
    const { service, repository } = fixture();
    await expect(
      service.completeUpload(input, { id: "editor-1", roles: ["editor"] }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "active",
        createdBy: "editor-1",
        bytes: 1_000,
      }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: input.publicId,
        consentReference: "consent-1",
      }),
    );
    await expect(
      service.completeUpload(input, {
        id: "translator-1",
        roles: ["translator"],
      }),
    ).rejects.toThrow(/governance role/i);

    const pressFixture = fixture();
    await expect(
      pressFixture.service.completeUpload(input, {
        id: "press-1",
        roles: ["press_officer"],
      }),
    ).resolves.toEqual(expect.objectContaining({ createdBy: "press-1" }));
  });

  it("destroys an oversized upload instead of registering it", async () => {
    const { service, cloudinary, repository } = fixture(16 * 1024 * 1024);
    await expect(
      service.completeUpload(input, { id: "editor-1", roles: ["editor"] }),
    ).rejects.toThrow(/size/i);
    expect(cloudinary.destroy).toHaveBeenCalledWith(input.publicId, "image");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("destroys a provider asset whose format is outside the allowlist", async () => {
    const { service, cloudinary, repository } = fixture(1_000, "svg");
    await expect(
      service.completeUpload(input, { id: "editor-1", roles: ["editor"] }),
    ).rejects.toThrow(/format/i);
    expect(cloudinary.destroy).toHaveBeenCalledWith(input.publicId, "image");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("compensates a registry failure and reports cleanup failure for reconciliation", async () => {
    const first = fixture();
    first.repository.create.mockRejectedValue(new Error("duplicate registry"));
    await expect(
      first.service.completeUpload(input, {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/duplicate registry/i);
    expect(first.cloudinary.destroy).toHaveBeenCalledWith(
      input.publicId,
      "image",
    );

    const second = fixture();
    second.repository.create.mockRejectedValue(new Error("database offline"));
    second.cloudinary.destroy.mockRejectedValue(new Error("provider offline"));
    await expect(
      second.service.completeUpload(input, {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/requires reconciliation/i);
  });

  it("refuses to re-register an already-registered asset without touching the provider", async () => {
    const { service, cloudinary, repository } = fixture();
    repository.existsByPublicId.mockResolvedValue(true);
    await expect(
      service.completeUpload(input, { id: "editor-1", roles: ["editor"] }),
    ).rejects.toThrow(/already registered/i);
    expect(repository.existsByPublicId).toHaveBeenCalledWith(
      input.publicId,
      "image",
    );
    // The existing asset must not be verified, destroyed or overwritten.
    expect(cloudinary.verifyAsset).not.toHaveBeenCalled();
    expect(cloudinary.destroy).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("never destroys the provider asset on a unique-key registry collision", async () => {
    const { service, cloudinary, repository } = fixture();
    repository.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.completeUpload(input, { id: "editor-1", roles: ["editor"] }),
    ).rejects.toThrow(/already registered/i);
    // A duplicate key means another registration owns the asset; deleting it
    // would destroy that owner's live asset.
    expect(cloudinary.destroy).not.toHaveBeenCalled();
  });

  it("invalidates Cloudinary before retiring the registry record", async () => {
    const { service, cloudinary, repository } = fixture();
    repository.find.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "active",
    });
    repository.claimManualDeletion.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "quarantined",
    });
    await service.deleteAsset("asset-1", {
      id: "trust-1",
      roles: ["trust_admin"],
    });
    expect(cloudinary.destroy).toHaveBeenCalledBefore(
      repository.completeRetention,
    );
  });

  it("restores the registry asset when provider deletion fails", async () => {
    const { service, cloudinary, repository } = fixture();
    repository.find.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "active",
    });
    repository.claimManualDeletion.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "quarantined",
    });
    cloudinary.destroy.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      service.deleteAsset("asset-1", {
        id: "trust-1",
        roles: ["trust_admin"],
      }),
    ).rejects.toThrow(/provider unavailable/i);
    expect(repository.restoreManualDeletion).toHaveBeenCalledWith(
      "asset-1",
      expect.stringMatching(/^[0-9a-f-]{36}$/u),
    );
    expect(repository.completeRetention).not.toHaveBeenCalled();
  });

  it("keeps a provider-removed asset quarantined when registry completion fails", async () => {
    const { service, repository } = fixture();
    repository.find.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "active",
    });
    repository.claimManualDeletion.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "quarantined",
    });
    repository.completeRetention.mockResolvedValue(false);

    await expect(
      service.deleteAsset("asset-1", {
        id: "trust-1",
        roles: ["trust_admin"],
      }),
    ).rejects.toThrow(/requires reconciliation/i);
    expect(repository.restoreManualDeletion).not.toHaveBeenCalled();
  });

  it("fails closed when retention or a published reference protects an asset", async () => {
    const { service, cloudinary, repository } = fixture();
    repository.find.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "active",
      legalHold: true,
    });
    await expect(
      service.deleteAsset("asset-1", {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/retention hold/i);

    repository.find.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "active",
      retentionPolicy: "permanent",
    });
    await expect(
      service.deleteAsset("asset-1", {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/retention hold/i);

    repository.find.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "active",
      retainUntil: new Date(Date.now() + 60_000),
    });
    await expect(
      service.deleteAsset("asset-1", {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/has not elapsed/i);

    repository.find.mockResolvedValue({
      ...input,
      assetId: "asset-1",
      status: "active",
    });
    repository.isReferencedByPublication.mockResolvedValue(true);
    await expect(
      service.deleteAsset("asset-1", {
        id: "editor-1",
        roles: ["editor"],
      }),
    ).rejects.toThrow(/published content/i);
    expect(cloudinary.destroy).not.toHaveBeenCalled();
  });

  it("lists a bounded library and records governed metadata updates", async () => {
    const { service, repository } = fixture();
    const asset = {
      ...input,
      assetId: "00000000-0000-4000-8000-000000000001",
      status: "active" as const,
      createdBy: "editor-1",
      createdAt: new Date(),
      secureUrl: "https://res.cloudinary.com/demo/image/upload/portrait.jpg",
      format: "jpg",
      bytes: 1_000,
      version: 1,
    };
    repository.list.mockResolvedValue({ items: [asset] });
    repository.find.mockResolvedValue(asset);
    repository.updateMetadata.mockResolvedValue({
      ...asset,
      focalPoint: { x: 0.25, y: 0.75 },
    });

    await expect(
      service.listAssets({ limit: 25 }, { id: "editor-1", roles: ["editor"] }),
    ).resolves.toEqual({ items: [asset] });
    await expect(
      service.updateMetadata(
        asset.assetId,
        { ...input, focalPoint: { x: 0.25, y: 0.75 } },
        { id: "editor-1", roles: ["editor"] },
      ),
    ).resolves.toMatchObject({ focalPoint: { x: 0.25, y: 0.75 } });
    expect(repository.updateMetadata).toHaveBeenCalledWith(
      asset.assetId,
      expect.objectContaining({ transformationPolicy: "portrait" }),
      "editor-1",
      expect.any(Date),
    );
  });

  it("reports every asset with publication and actionable governance gaps", async () => {
    const { service, repository } = fixture();
    const asset = {
      ...input,
      assetId: "00000000-0000-4000-8000-000000000001",
      status: "active" as const,
      createdBy: "press-1",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      secureUrl: "https://res.cloudinary.com/demo/image/upload/portrait.jpg",
      format: "jpg",
      bytes: 1_000,
      version: 1,
      consentReference: undefined,
      focalPoint: undefined,
      altText: {
        ...localized,
        "fr-FR": "",
        status: { "en-GB": "current" as const, "fr-FR": "missing" as const },
      },
    };
    repository.inventory.mockResolvedValue({
      assets: [asset],
      publishedAssetIds: new Set([asset.assetId]),
    });

    const report = await service.inventory({
      id: "press-1",
      roles: ["press_officer"],
    });
    expect(report.totals).toMatchObject({
      assets: 1,
      active: 1,
      published: 1,
      actionRequired: 1,
    });
    expect(report.items[0]).toMatchObject({
      folder: "portraits",
      publishedReference: true,
      governanceStatus: "action_required",
      gaps: expect.arrayContaining([
        "french_alt_missing",
        "consent_reference_missing",
        "image_focal_point_missing",
      ]),
    });
  });

  it("rejects focal-point metadata for non-image assets", async () => {
    const { service, repository } = fixture();
    repository.find.mockResolvedValue({
      ...input,
      assetId: "00000000-0000-4000-8000-000000000002",
      resourceType: "video",
      status: "active",
    });
    await expect(
      service.updateMetadata(
        "00000000-0000-4000-8000-000000000002",
        { ...input, focalPoint: { x: 0.5, y: 0.5 } },
        { id: "editor-1", roles: ["editor"] },
      ),
    ).rejects.toThrow(/only images/i);
    expect(repository.updateMetadata).not.toHaveBeenCalled();
  });
});
