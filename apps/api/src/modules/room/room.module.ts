import { Module, type DynamicModule } from "@nestjs/common";
import { getConnectionToken } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { AuthModule } from "../auth/auth.module";
import { RoomAuditService } from "./application/room-audit.service";
import { RoomConfigService } from "./application/room-config";
import { RoomDesignationService } from "./application/room-designation.service";
import { RoomEnquiryService } from "./application/room-enquiry.service";
import { RoomKeyManifestService } from "./application/room-key-manifest.service";
import { RoomRetentionService } from "./application/room-retention.service";
import { RoomOperatorController } from "./http/room-operator.controller";
import { RoomPublicController } from "./http/room-public.controller";
import { RoomRateLimitGuard } from "./http/room-rate-limit.guard";
import { RoomAccessGuard } from "./http/room-access.guard";
import { ROOM_CONNECTION } from "./persistence/room-database.constants";
import { RoomDatabaseModule } from "./persistence/room-database.module";
import { RoomEnquiryRepository } from "./persistence/room-enquiry.repository";
import { RoomRepository } from "./persistence/room.repository";

/**
 * The Room registers only when `ROOM_ENABLED=true`. When it is off, none of
 * these routes exist at all — they are not merely guarded — so a deployment
 * that has not completed key custody cannot accept a confidential submission by
 * accident.
 */
@Module({})
export class RoomModule {
  static register(): DynamicModule {
    if (!RoomConfigService.isEnabled()) {
      return { module: RoomModule };
    }

    return {
      module: RoomModule,
      imports: [RoomDatabaseModule, AuthModule],
      controllers: [RoomPublicController, RoomOperatorController],
      providers: [
        RoomConfigService,
        {
          provide: RoomRepository,
          inject: [getConnectionToken(ROOM_CONNECTION)],
          useFactory: (connection: Connection) =>
            new RoomRepository(connection),
        },
        RoomEnquiryRepository,
        RoomAuditService,
        RoomKeyManifestService,
        RoomEnquiryService,
        RoomDesignationService,
        RoomRetentionService,
        RoomRateLimitGuard,
        RoomAccessGuard,
      ],
    };
  }
}
