import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProtocolDeskService } from "./application/protocol-desk.service";
import { ProtocolDeskController } from "./http/protocol-desk.controller";
import { ProtocolDeskRateLimitGuard } from "./http/protocol-desk-rate-limit.guard";
import { ProtocolDeskRepository } from "./persistence/protocol-desk.repository";
import { ProtocolDeskOperatorController } from "./http/protocol-desk-operator.controller";
import { CorrespondenceWorker } from "./application/correspondence.worker";
import { ContentModule } from "../content/content.module";
import { MediaModule } from "../media/media.module";
import { PressKitModule } from "../press-kit/press-kit.module";
import { ProtocolNoteService } from "./application/protocol-note.service";
import { ProtocolDeskOperationsService } from "./application/protocol-desk-operations.service";
import { AvailabilityService } from "./application/availability.service";
import { TriageContextService } from "./application/triage-context.service";
import { CalendarSyncWorker } from "./application/calendar-sync.worker";
import { PrincipalDecisionDeliveryWorker } from "./application/principal-decision-delivery.worker";

@Module({
  imports: [AuthModule, ContentModule, MediaModule, PressKitModule],
  controllers: [ProtocolDeskController, ProtocolDeskOperatorController],
  providers: [
    ProtocolDeskService,
    ProtocolDeskRepository,
    ProtocolDeskRateLimitGuard,
    CorrespondenceWorker,
    ProtocolNoteService,
    ProtocolDeskOperationsService,
    AvailabilityService,
    TriageContextService,
    CalendarSyncWorker,
    PrincipalDecisionDeliveryWorker,
  ],
  exports: [ProtocolDeskService],
})
export class ProtocolDeskModule {}
