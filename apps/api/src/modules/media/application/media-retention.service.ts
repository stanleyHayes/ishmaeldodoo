import { randomUUID } from "node:crypto";
import { CloudinaryService } from "../infrastructure/cloudinary.service";
import { MediaRepository } from "../persistence/media.repository";

const staleLockMilliseconds = 60 * 60 * 1_000;
const retryMilliseconds = 60 * 60 * 1_000;
const publicationReviewMilliseconds = 24 * 60 * 60 * 1_000;

export type MediaRetentionResult = Readonly<{
  deleted: number;
  failed: number;
  referenced: number;
}>;

export class MediaRetentionService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async run(now = new Date(), batchLimit = 100): Promise<MediaRetentionResult> {
    let deleted = 0;
    let failed = 0;
    let referenced = 0;
    const staleBefore = new Date(now.getTime() - staleLockMilliseconds);

    for (let count = 0; count < batchLimit; count += 1) {
      const candidate = await this.repository.nextRetentionCandidate(
        now,
        staleBefore,
      );
      if (!candidate) break;

      const lockToken = randomUUID();
      const claimed = await this.repository.claimRetentionIfUnreferenced(
        candidate.assetId,
        now,
        staleBefore,
        lockToken,
        new Date(now.getTime() + publicationReviewMilliseconds),
      );
      if (claimed === "referenced") {
        referenced += 1;
        continue;
      }
      if (!claimed) continue;

      try {
        await this.cloudinary.destroy(claimed.publicId, claimed.resourceType);
        if (
          !(await this.repository.completeRetention(
            claimed.assetId,
            lockToken,
            now,
          ))
        )
          throw new Error(
            "Provider asset was removed but registry completion requires reconciliation",
          );
        deleted += 1;
      } catch (error) {
        failed += 1;
        await this.repository.failRetention(
          claimed.assetId,
          lockToken,
          now,
          new Date(now.getTime() + retryMilliseconds),
          error instanceof Error
            ? error.message
            : "Media retention provider deletion failed",
        );
      }
    }

    return { deleted, failed, referenced };
  }
}
