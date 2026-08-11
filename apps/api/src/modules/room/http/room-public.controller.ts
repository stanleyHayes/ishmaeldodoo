import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Logger,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiAcceptedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { RoomKeyManifest, RoomReceipt } from "@amanor/contracts";
import {
  RoomEnquiryService,
  RoomSubmissionRejectedError,
} from "../application/room-enquiry.service";
import {
  RoomKeyManifestService,
  RoomManifestUnavailableError,
} from "../application/room-key-manifest.service";
import { RoomRateLimitGuard } from "./room-rate-limit.guard";

/**
 * The public face of The Room. Two routes, both `no-store`, neither of which
 * reads, parses or logs a submission body.
 *
 * Every rejection returns the same shape and message. The threat model requires
 * uniform responses because a distinguishable error is an oracle: it would let
 * an attacker learn which envelope field they got wrong, or whether a given
 * envelope identifier had been seen before.
 */
@ApiTags("room")
@Controller("public/room")
export class RoomPublicController {
  private readonly logger = new Logger(RoomPublicController.name);

  constructor(
    @Inject(RoomKeyManifestService)
    private readonly manifests: RoomKeyManifestService,
    @Inject(RoomEnquiryService) private readonly enquiries: RoomEnquiryService,
  ) {}

  /**
   * Fetched before the submitter can type anything sensitive. If it fails, the
   * page must fail closed and offer the non-confidential contact route.
   */
  @Get("key-manifest")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({
    description: "The signed Room recipient key manifest.",
  })
  async keyManifest(): Promise<RoomKeyManifest> {
    try {
      return await this.manifests.current();
    } catch (error) {
      if (!(error instanceof RoomManifestUnavailableError)) {
        // A fault other than "no verifiable manifest" — misconfiguration or an
        // unreachable Room database. Logged as a bounded code so it is
        // diagnosable without ever describing the manifest.
        this.logger.error("Room key manifest route failed: internal");
      }
      throw new ServiceUnavailableException(
        "The confidential channel is temporarily unavailable",
      );
    }
  }

  @Post("enquiries")
  @HttpCode(202)
  @UseGuards(RoomRateLimitGuard)
  @Header("Cache-Control", "no-store")
  @ApiAcceptedResponse({
    description: "Ciphertext accepted; an unpredictable receipt is returned.",
  })
  async submit(@Body() body: unknown): Promise<RoomReceipt> {
    try {
      return await this.enquiries.accept(body);
    } catch (error) {
      if (error instanceof RoomSubmissionRejectedError) {
        // Deliberately carries no issue list. Echoing validation issues would
        // reflect attacker-controlled input and reveal the envelope grammar.
        throw new BadRequestException("Room submission was not accepted");
      }
      // Persistence uncertainty must not produce a success claim; the submitter
      // may retry with the same envelope identifier without duplicating.
      throw new ServiceUnavailableException(
        "The confidential channel is temporarily unavailable",
      );
    }
  }
}
