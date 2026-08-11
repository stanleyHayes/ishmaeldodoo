import { Injectable } from "@nestjs/common";
import type { GovernedMediaReference } from "../domain/media";
import { MediaRepository } from "../persistence/media.repository";

@Injectable()
export class MediaReferenceService {
  constructor(private readonly repository: MediaRepository) {}

  async assertPublishable(
    references: readonly GovernedMediaReference[],
  ): Promise<void> {
    if (references.length === 0) return;
    const assets = await this.repository.findMany(
      references.map((reference) => reference.assetId),
    );
    const assetsById = new Map(assets.map((asset) => [asset.assetId, asset]));

    for (const reference of references) {
      const asset = assetsById.get(reference.assetId);
      if (!asset || asset.status !== "active")
        throw new Error(`${reference.path}: governed media is not active`);
      if (asset.resourceType !== reference.resourceType)
        throw new Error(
          `${reference.path}: governed media must be ${reference.resourceType}`,
        );
      if (
        reference.folder &&
        !asset.publicId.startsWith(`amanor/${reference.folder}/`)
      )
        throw new Error(
          `${reference.path}: governed media must use the ${reference.folder} folder`,
        );
    }
  }
}
