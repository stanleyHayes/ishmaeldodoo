import { Module } from "@nestjs/common";
import { ContentModule } from "../content/content.module";
import { MediaModule } from "../media/media.module";
import { PressKitController } from "./press-kit.controller";
import { PressKitRepository } from "./press-kit.repository";
import { PressKitService } from "./press-kit.service";
import { AuthModule } from "../auth/auth.module";
import { PressKitRateLimitGuard } from "./press-kit-rate-limit.guard";
import { MediaEnquiryController } from "./media-enquiry.controller";
import { MediaEnquiryService } from "./media-enquiry.service";
import { MediaEnquiryWorker } from "./media-enquiry.worker";
import { BrowserPdfService } from "./browser-pdf.service";
import { LivingDossierController } from "./living-dossier.controller";
import { LivingDossierService } from "./living-dossier.service";

@Module({
  imports: [AuthModule, ContentModule, MediaModule],
  controllers: [
    PressKitController,
    MediaEnquiryController,
    LivingDossierController,
  ],
  providers: [
    BrowserPdfService,
    PressKitService,
    LivingDossierService,
    PressKitRepository,
    PressKitRateLimitGuard,
    MediaEnquiryService,
    MediaEnquiryWorker,
  ],
  exports: [BrowserPdfService],
})
export class PressKitModule {}
