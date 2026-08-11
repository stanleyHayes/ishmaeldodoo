import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller";
import { validateEnvironment } from "./config/environment";
import { DatabaseModule } from "./platform/mongo/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ContentModule } from "./modules/content/content.module";
import { MediaModule } from "./modules/media/media.module";
import { PressKitModule } from "./modules/press-kit/press-kit.module";
import { ProtocolDeskModule } from "./modules/protocol-desk/protocol-desk.module";
import { MetricsController } from "./health/metrics.controller";
import { ContactModule } from "./modules/contact/contact.module";
import { RoomModule } from "./modules/room/room.module";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrivilegedReadAuditInterceptor } from "./common/privileged-read-audit.interceptor";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: process.env.NODE_ENV === "test",
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    ContentModule,
    MediaModule,
    PressKitModule,
    ProtocolDeskModule,
    ContactModule,
    // Registers nothing unless ROOM_ENABLED=true; see RoomModule.
    RoomModule.register(),
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: PrivilegedReadAuditInterceptor,
    },
  ],
})
export class AppModule {}
