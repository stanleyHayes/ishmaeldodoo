import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MediaService } from "./application/media.service";
import {
  MediaController,
  PublicMediaController,
} from "./http/media.controller";
import { CloudinaryService } from "./infrastructure/cloudinary.service";
import { MediaRepository } from "./persistence/media.repository";
import { PublicServiceGuard } from "../../common/public-service.guard";
import { MediaReferenceService } from "./application/media-reference.service";

@Module({
  imports: [AuthModule],
  controllers: [MediaController, PublicMediaController],
  providers: [
    MediaService,
    CloudinaryService,
    MediaRepository,
    MediaReferenceService,
    PublicServiceGuard,
  ],
  exports: [MediaService, MediaReferenceService],
})
export class MediaModule {}
