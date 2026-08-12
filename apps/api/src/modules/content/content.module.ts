import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CmsService } from "./application/cms.service";
import { CmsController } from "./http/cms.controller";
import { CmsRepository } from "./persistence/cms.repository";
import { PublicContentController } from "./http/public-content.controller";
import { RevalidationOutboxService } from "./application/revalidation-outbox.service";
import { PublicSourcesController } from "./http/public-sources.controller";
import { PublicAtlasController } from "./http/public-atlas.controller";
import { PublicServiceGuard } from "../../common/public-service.guard";
import { RevalidationClaimController } from "./http/revalidation-claim.controller";
import { RevalidationClaimRepository } from "./persistence/revalidation-claim.repository";
import { PublicArchiveController } from "./http/public-archive.controller";
import { PublicSpeakingController } from "./http/public-speaking.controller";
import { AdminMutationOriginGuard } from "../../common/admin-mutation-origin.guard";
import { PublicSignalsController } from "./http/public-signals.controller";
import { MediaModule } from "../media/media.module";
import { PublicLegacyController } from "./http/public-legacy.controller";

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [
    CmsController,
    PublicContentController,
    PublicSourcesController,
    PublicAtlasController,
    PublicArchiveController,
    PublicSpeakingController,
    PublicSignalsController,
    PublicLegacyController,
    RevalidationClaimController,
  ],
  providers: [
    CmsService,
    CmsRepository,
    RevalidationOutboxService,
    PublicServiceGuard,
    RevalidationClaimRepository,
    AdminMutationOriginGuard,
  ],
  exports: [CmsService],
})
export class ContentModule {}
