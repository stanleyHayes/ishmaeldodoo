import { Inject, Injectable, Logger } from "@nestjs/common";
import { verifyRoomKeyManifest, type RoomKeyManifest } from "@amanor/contracts";
import { RoomEnquiryRepository } from "../persistence/room-enquiry.repository";
import { RoomConfigService } from "./room-config";

export class RoomManifestUnavailableError extends Error {
  constructor() {
    super("Room key manifest is unavailable");
  }
}

/**
 * Serves the signed recipient key manifest to the public web.
 *
 * The browser verifies the signature itself against a pinned anchor — that is
 * the control that matters. This service verifies it a second time before
 * release so that a manifest which has expired, been tampered with in the
 * database, or been signed by a key other than the pinned anchor is never
 * handed out at all. A compromised database alone therefore cannot redirect
 * submissions to an attacker's key without also breaking the signature.
 */
@Injectable()
export class RoomKeyManifestService {
  private readonly logger = new Logger(RoomKeyManifestService.name);

  constructor(
    @Inject(RoomEnquiryRepository)
    private readonly repository: RoomEnquiryRepository,
    @Inject(RoomConfigService)
    private readonly configuration: RoomConfigService,
  ) {}

  async current(now = new Date()): Promise<RoomKeyManifest> {
    const stored = await this.repository.activeManifest();
    if (!stored) {
      // A bounded reason code, never the manifest itself. Without it an operator
      // cannot tell "no key published yet" from "the published key no longer
      // verifies", and those are very different incidents.
      this.logger.error("Room key manifest unavailable: absent");
      throw new RoomManifestUnavailableError();
    }

    const { trustAnchorKeyId, trustAnchorPublicKey } =
      this.configuration.read();
    try {
      await verifyRoomKeyManifest({
        manifest: stored,
        trustAnchorKeyId,
        trustAnchorPublicKey,
        at: now,
      });
    } catch {
      this.logger.error("Room key manifest unavailable: unverifiable");
      // Uniform failure to the caller: it learns the channel is unavailable,
      // never whether the manifest was expired, malformed or hostile.
      throw new RoomManifestUnavailableError();
    }
    return stored;
  }
}
