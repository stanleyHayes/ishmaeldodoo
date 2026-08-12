import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { EditorialActor } from "../../content/domain/types";
import type {
  CompleteUpload,
  MediaAsset,
  MediaAssetListQuery,
  MediaAssetPage,
  MediaInventoryGap,
  MediaInventoryReport,
  MediaMetadataUpdate,
} from "../domain/media";
import { CloudinaryService } from "../infrastructure/cloudinary.service";
import type { SignedUpload } from "../infrastructure/cloudinary.service";
import { MediaRepository } from "../persistence/media.repository";

const mediaRoles = new Set([
  "principal",
  "editor",
  "press_officer",
  "trust_admin",
]);
const maximumBytes = {
  image: 15 * 1024 * 1024,
  video: 250 * 1024 * 1024,
  raw: 25 * 1024 * 1024,
} as const;
const permittedFormats: Readonly<
  Record<CompleteUpload["resourceType"], ReadonlySet<string>>
> = {
  image: new Set(["jpg", "jpeg", "png", "webp", "avif"]),
  video: new Set(["mp4", "webm", "mp3", "m4a", "wav"]),
  raw: new Set(["pdf"]),
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

@Injectable()
export class MediaService {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly repository: MediaRepository,
  ) {}

  signUpload(
    folder: string,
    resourceType: string,
    actor: EditorialActor,
  ): SignedUpload {
    this.assertMediaRole(actor);
    return this.cloudinary.signUpload(folder, resourceType);
  }

  async completeUpload(
    input: CompleteUpload,
    actor: EditorialActor,
  ): Promise<MediaAsset> {
    this.assertMediaRole(actor);
    // Reject an already-registered identifier before touching Cloudinary. This
    // stops a media-role user from re-registering (and, via the duplicate-key
    // cleanup path below, destroying) an asset uploaded by someone else.
    if (
      await this.repository.existsByPublicId(input.publicId, input.resourceType)
    )
      throw new Error(
        "A media asset for this identifier is already registered",
      );
    const verified = await this.cloudinary.verifyAsset(
      input.publicId,
      input.resourceType,
    );
    if (
      verified.publicId !== input.publicId ||
      verified.resourceType !== input.resourceType
    )
      throw new Error("Cloudinary asset identity did not match");
    if (verified.bytes > maximumBytes[input.resourceType]) {
      await this.cloudinary.destroy(input.publicId, input.resourceType);
      throw new Error("Media asset exceeds the permitted size");
    }
    if (
      !permittedFormats[input.resourceType].has(verified.format.toLowerCase())
    ) {
      await this.cloudinary.destroy(input.publicId, input.resourceType);
      throw new Error("Media asset format is not permitted");
    }
    const asset: MediaAsset = {
      ...input,
      ...verified,
      assetId: randomUUID(),
      status: "active",
      createdBy: actor.id,
      createdAt: new Date(),
    };
    try {
      await this.repository.create(asset);
    } catch (error) {
      // A unique-key collision means another registration already owns this
      // asset; destroying it would delete that owner's live asset, so only
      // clean up the freshly uploaded orphan on other (transient) failures.
      if (isDuplicateKeyError(error))
        throw new Error(
          "A media asset for this identifier is already registered",
        );
      try {
        await this.cloudinary.destroy(input.publicId, input.resourceType);
      } catch {
        throw new Error(
          "Media registry failed and provider cleanup requires reconciliation",
        );
      }
      throw error;
    }
    return asset;
  }

  async publicAsset(assetId: string): Promise<MediaAsset | null> {
    return this.repository.findPublic(assetId);
  }

  async listAssets(
    query: MediaAssetListQuery,
    actor: EditorialActor,
  ): Promise<MediaAssetPage> {
    this.assertMediaRole(actor);
    return this.repository.list(query);
  }

  async inventory(actor: EditorialActor): Promise<MediaInventoryReport> {
    this.assertMediaRole(actor);
    const generatedAt = new Date();
    const { assets, publishedAssetIds } = await this.repository.inventory();
    const items = assets.map((asset) => {
      const gaps: MediaInventoryGap[] = [];
      if (
        !asset.altText["fr-FR"].trim() ||
        asset.altText.status["fr-FR"] === "missing"
      )
        gaps.push("french_alt_missing");
      else if (asset.altText.status["fr-FR"] === "stale")
        gaps.push("french_alt_stale");
      if (!asset.consentReference) gaps.push("consent_reference_missing");
      if (asset.resourceType === "image" && !asset.focalPoint)
        gaps.push("image_focal_point_missing");
      if (asset.retentionPolicy === "expires" && !asset.retainUntil)
        gaps.push("expiry_date_missing");
      if (
        asset.status === "active" &&
        asset.retainUntil &&
        asset.retainUntil.getTime() <= generatedAt.getTime()
      )
        gaps.push("expired_active_asset");
      const folder = asset.publicId.split(
        "/",
      )[1] as MediaInventoryReport["items"][number]["folder"];
      return {
        ...asset,
        folder,
        publishedReference: publishedAssetIds.has(asset.assetId),
        governanceStatus:
          gaps.length === 0 ? ("ready" as const) : ("action_required" as const),
        gaps,
      };
    });
    return {
      generatedAt,
      totals: {
        assets: items.length,
        active: items.filter((item) => item.status === "active").length,
        deleted: items.filter((item) => item.status === "deleted").length,
        quarantined: items.filter((item) => item.status === "quarantined")
          .length,
        published: items.filter((item) => item.publishedReference).length,
        actionRequired: items.filter(
          (item) => item.governanceStatus === "action_required",
        ).length,
      },
      items,
    };
  }

  async updateMetadata(
    assetId: string,
    input: MediaMetadataUpdate,
    actor: EditorialActor,
  ): Promise<MediaAsset> {
    this.assertMediaRole(actor);
    const current = await this.repository.find(assetId);
    if (!current || current.status !== "active")
      throw new Error("Media asset was not found");
    if (input.focalPoint && current.resourceType !== "image")
      throw new Error("Only images may define a focal point");
    const updated = await this.repository.updateMetadata(
      assetId,
      input,
      actor.id,
      new Date(),
    );
    if (!updated) throw new Error("Media asset changed concurrently");
    return updated;
  }

  async deleteAsset(assetId: string, actor: EditorialActor): Promise<void> {
    this.assertMediaRole(actor);
    const asset = await this.repository.find(assetId);
    if (!asset || asset.status !== "active")
      throw new Error("Media asset was not found");
    if (asset.legalHold || asset.retentionPolicy === "permanent")
      throw new Error("Media asset is protected by a retention hold");
    if (asset.retainUntil && asset.retainUntil.getTime() > Date.now())
      throw new Error("Media asset retention period has not elapsed");
    if (await this.repository.isReferencedByPublication(assetId))
      throw new Error("Media asset is referenced by published content");
    const now = new Date();
    const lockToken = randomUUID();
    const claimed = await this.repository.claimManualDeletion(
      assetId,
      now,
      lockToken,
    );
    if (!claimed)
      throw new Error("Media asset changed or became referenced concurrently");
    let providerRemoved = false;
    try {
      await this.cloudinary.destroy(claimed.publicId, claimed.resourceType);
      providerRemoved = true;
      if (!(await this.repository.completeRetention(assetId, lockToken, now)))
        throw new Error(
          "Provider asset was removed but registry completion requires reconciliation",
        );
    } catch (error) {
      if (!providerRemoved)
        await this.repository.restoreManualDeletion(assetId, lockToken);
      throw error;
    }
  }

  private assertMediaRole(actor: EditorialActor): void {
    if (!actor.roles.some((role) => mediaRoles.has(role)))
      throw new Error("A media governance role is required");
  }
}
